import axios from 'axios'
import { NextFunction, Request, Response } from 'express'
import Redis from 'ioredis'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { logger } from '../utils/logger'

interface TenantRequest extends Request {
	tenant?: {
		id: string
		name: string
		status: string
		plan: string
		limits: {
			maxUsers: number
			maxCompanies: number
			maxContacts: number
			maxOpportunities: number
			maxTasks: number
		}
		usage?: {
			activeUsers: number
			companies: number
			contacts: number
			opportunities: number
			tasks: number
		}
	}
	user?: {
		id: string
		email: string
		tenant_id: string
		role: string
	}
}

// Redis client for tenant caching
const redis = new Redis({
	host: config.redis.host,
	port: config.redis.port,
	password: config.redis.password,
	retryDelayOnFailover: 100,
	maxRetriesPerRequest: 3,
	lazyConnect: true,
})

redis.on('connect', () => {
	logger.info('Redis connected for tenant caching')
})

redis.on('error', error => {
	logger.error('Redis connection error:', error)
})

export const tenantMiddleware = async (
	req: TenantRequest,
	res: Response,
	next: NextFunction
): Promise<void> => {
	try {
		// Skip tenant validation for auth endpoints and health checks
		if (req.path.startsWith('/api/v1/auth') || req.path === '/health') {
			return next()
		}

		const token = req.headers.authorization?.split(' ')[1]

		if (!token) {
			res.status(401).json({ error: 'No authentication token provided' })
			return
		}

		let decoded: any
		try {
			decoded = jwt.verify(token, config.jwt.secret) as any
		} catch (jwtError) {
			res.status(401).json({ error: 'Invalid authentication token' })
			return
		}

		const tenantId = decoded.tenant_id

		if (!tenantId) {
			res.status(400).json({ error: 'No tenant information in token' })
			return
		}

		// Validate UUID format
		const uuidRegex =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		if (!uuidRegex.test(tenantId)) {
			res.status(400).json({ error: 'Invalid tenant ID format' })
			return
		}

		// Try to get tenant from cache first
		let tenantData = await getTenantFromCache(tenantId)

		if (!tenantData) {
			// Fetch from CRM service if not in cache
			tenantData = await fetchTenantFromService(tenantId)

			if (!tenantData) {
				res.status(403).json({ error: 'Invalid or inactive tenant' })
				return
			}

			// Cache tenant data for 5 minutes
			await cacheTenantData(tenantId, tenantData)
		}

		// Check tenant status
		if (tenantData.status !== 'active') {
			res.status(403).json({
				error: 'Tenant is not active',
				status: tenantData.status,
			})
			return
		}

		// Check trial expiration
		if (
			tenantData.isTrial &&
			tenantData.trialEndsAt &&
			new Date() > new Date(tenantData.trialEndsAt)
		) {
			res.status(403).json({
				error: 'Trial period expired',
				trialEndsAt: tenantData.trialEndsAt,
			})
			return
		}

		// Set tenant and user context
		req.tenant = {
			id: tenantData.id,
			name: tenantData.name,
			status: tenantData.status,
			plan: tenantData.subscriptionPlan,
			limits: {
				maxUsers: tenantData.maxUsers,
				maxCompanies: tenantData.maxCompanies,
				maxContacts: tenantData.maxContacts,
				maxOpportunities: tenantData.maxOpportunities,
				maxTasks: tenantData.maxTasks,
			},
		}

		req.user = {
			id: decoded.sub || decoded.user_id,
			email: decoded.email || decoded.sub,
			tenant_id: tenantId,
			role: decoded.role || 'user',
		}

		// Set headers for downstream services
		req.headers['x-tenant-id'] = tenantId
		req.headers['x-tenant-name'] = tenantData.name
		req.headers['x-tenant-plan'] = tenantData.subscriptionPlan
		req.headers['x-user-id'] = decoded.sub || decoded.user_id
		req.headers['x-user-email'] = decoded.email || decoded.sub
		req.headers['x-user-role'] = decoded.role || 'user'

		logger.debug('Tenant context established:', {
			tenantId: tenantData.id,
			tenantName: tenantData.name,
			userId: decoded.sub || decoded.user_id,
			userRole: decoded.role,
			requestPath: req.path,
		})

		next()
	} catch (error) {
		logger.error('Tenant middleware error:', error)
		res.status(500).json({ error: 'Tenant validation failed' })
	}
}

// Cache operations
async function getTenantFromCache(tenantId: string): Promise<any> {
	try {
		const cached = await redis.get(`tenant:${tenantId}`)
		return cached ? JSON.parse(cached) : null
	} catch (error) {
		logger.error('Cache get error:', error)
		return null
	}
}

async function cacheTenantData(tenantId: string, data: any): Promise<void> {
	try {
		await redis.setex(`tenant:${tenantId}`, 300, JSON.stringify(data)) // 5 minutes
	} catch (error) {
		logger.error('Cache set error:', error)
	}
}

async function fetchTenantFromService(tenantId: string): Promise<any> {
	try {
		const response = await axios.get(
			`${config.services.crm.url}/api/v1/tenants/${tenantId}`,
			{
				headers: {
					'Content-Type': 'application/json',
					'x-service-auth': 'gateway-internal', // Internal service auth
				},
				timeout: 5000,
			}
		)

		return response.data
	} catch (error) {
		if (axios.isAxiosError(error) && error.response?.status === 404) {
			return null
		}
		logger.error('Failed to fetch tenant from service:', error)
		return null
	}
}

// Tenant-specific rate limiting middleware
export const tenantRateLimit = async (
	req: TenantRequest,
	res: Response,
	next: NextFunction
): Promise<void> => {
	if (!req.tenant) {
		return next()
	}

	const tenantId = req.tenant.id
	const key = `rate_limit:${tenantId}`

	try {
		// Get rate limit based on plan
		const limits = getTenantRateLimits(req.tenant.plan)

		const current = await redis.incr(key)

		if (current === 1) {
			await redis.expire(key, 60) // 1 minute window
		}

		if (current > limits.requestsPerMinute) {
			res.status(429).json({
				error: 'Rate limit exceeded for tenant',
				limit: limits.requestsPerMinute,
				window: '1 minute',
				retryAfter: 60,
			})
			return
		}

		// Add rate limit headers
		res.setHeader('X-RateLimit-Limit', limits.requestsPerMinute.toString())
		res.setHeader(
			'X-RateLimit-Remaining',
			Math.max(0, limits.requestsPerMinute - current).toString()
		)
		res.setHeader(
			'X-RateLimit-Reset',
			new Date(Date.now() + 60000).toISOString()
		)

		next()
	} catch (error) {
		logger.error('Rate limiting error:', error)
		next() // Don't block on rate limiting errors
	}
}

function getTenantRateLimits(plan: string): { requestsPerMinute: number } {
	switch (plan?.toLowerCase()) {
		case 'trial':
			return { requestsPerMinute: 100 }
		case 'basic':
			return { requestsPerMinute: 500 }
		case 'professional':
			return { requestsPerMinute: 1000 }
		case 'enterprise':
			return { requestsPerMinute: 5000 }
		default:
			return { requestsPerMinute: 100 }
	}
}

// Tenant limit validation middleware
export const validateTenantLimits = (resourceType: string) => {
	return async (
		req: TenantRequest,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		// Only check limits for POST requests (creation)
		if (req.method !== 'POST' || !req.tenant) {
			return next()
		}

		try {
			const canCreate = await checkTenantResourceLimit(
				req.tenant.id,
				resourceType
			)

			if (!canCreate) {
				res.status(403).json({
					error: `Tenant limit exceeded for ${resourceType}`,
					currentPlan: req.tenant.plan,
					action: 'upgrade_required',
				})
				return
			}

			next()
		} catch (error) {
			logger.error('Tenant limit validation error:', error)
			next() // Allow on error to avoid blocking
		}
	}
}

async function checkTenantResourceLimit(
	tenantId: string,
	resourceType: string
): Promise<boolean> {
	try {
		const response = await axios.get(
			`${config.services.crm.url}/api/v1/tenants/${tenantId}/usage`,
			{
				headers: {
					'x-service-auth': 'gateway-internal',
					'x-tenant-id': tenantId,
				},
				timeout: 5000,
			}
		)

		const usage = response.data
		const tenant = await getTenantFromCache(tenantId)

		if (!tenant || !usage) {
			return true // Allow if we can't check
		}

		// Check specific resource limits
		switch (resourceType) {
			case 'users':
				return usage.activeUsers < tenant.limits.maxUsers
			case 'companies':
				return usage.companies < tenant.limits.maxCompanies
			case 'contacts':
				return usage.contacts < tenant.limits.maxContacts
			case 'opportunities':
				return usage.opportunities < tenant.limits.maxOpportunities
			case 'tasks':
				return usage.tasks < tenant.limits.maxTasks
			default:
				return true
		}
	} catch (error) {
		logger.error('Failed to check tenant limits:', error)
		return true // Allow on error
	}
}

// Invalidate tenant cache (for when tenant data changes)
export const invalidateTenantCache = async (
	tenantId: string
): Promise<void> => {
	try {
		await redis.del(`tenant:${tenantId}`)
		logger.debug('Tenant cache invalidated:', { tenantId })
	} catch (error) {
		logger.error('Cache invalidation error:', error)
	}
}
