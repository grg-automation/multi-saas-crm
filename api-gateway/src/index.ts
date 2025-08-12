// api-gateway/src/index.ts - ENHANCED VERSION
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { config } from './config'
import { authMiddleware } from './middleware/auth'
import { errorHandler } from './middleware/errorHandler'
import { loggingMiddleware } from './middleware/logging'
import {
	tenantMiddleware,
	tenantRateLimit,
	validateTenantLimits,
} from './middleware/tenant'
import { healthCheck } from './routes/health'
import kworkRoutes from './routes/kwork'
import { serviceRegistry } from './services/serviceRegistry'
import { logger } from './utils/logger'

const app = express()

// Security middleware
app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				scriptSrc: ["'self'"],
				imgSrc: ["'self'", 'data:', 'https:'],
			},
		},
	})
)

// CORS configuration
app.use(
	cors({
		origin: config.cors.origin,
		credentials: true,
	})
)

// Global rate limiting (fallback)
const globalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 1000, // Global limit
	message: 'Too many requests from this IP, please try again later.',
	standardHeaders: true,
	legacyHeaders: false,
})
app.use(globalLimiter)

// Request parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Custom middleware
app.use(loggingMiddleware)

// Health check endpoint (no auth needed)
app.use('/health', healthCheck)

// ===== PUBLIC AUTHENTICATION ROUTES =====
// No auth middleware needed for these
app.use(
	'/api/v1/auth',
	createProxyMiddleware({
		target: serviceRegistry.getService('auth').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/auth': '/api/v1/auth',
		},
		onError: (err, req, res) => {
			logger.error('Auth service proxy error:', err)
			res.status(503).json({ error: 'Auth service unavailable' })
		},
		onProxyReq: (proxyReq, req, res) => {
			if (req.body) {
				const bodyData = JSON.stringify(req.body)
				proxyReq.setHeader('Content-Type', 'application/json')
				proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData))
				proxyReq.write(bodyData)
				proxyReq.end()
			}
		},
	})
)

// ===== PROTECTED ROUTES (REQUIRE AUTH + TENANT) =====
// Apply auth and tenant middleware to all protected routes
app.use('/api/v1', authMiddleware, tenantMiddleware, tenantRateLimit)

// ===== CRM CORE ROUTES (with resource limit validation) =====
// Companies
app.use(
	'/api/v1/companies',
	validateTenantLimits('companies'),
	createProxyMiddleware({
		target: serviceRegistry.getService('crm').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/companies': '/companies', // Kotlin service expects this path
		},
		onError: (err, req, res) => {
			logger.error('Companies service proxy error:', err)
			res.status(503).json({ error: 'Companies service unavailable' })
		},
	})
)

// Contacts
app.use(
	'/api/v1/contacts',
	validateTenantLimits('contacts'),
	createProxyMiddleware({
		target: serviceRegistry.getService('crm').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/contacts': '/contacts',
		},
		onError: (err, req, res) => {
			logger.error('Contacts service proxy error:', err)
			res.status(503).json({ error: 'Contacts service unavailable' })
		},
	})
)

// Opportunities
app.use(
	'/api/v1/opportunities',
	validateTenantLimits('opportunities'),
	createProxyMiddleware({
		target: serviceRegistry.getService('crm').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/opportunities': '/opportunities',
		},
		onError: (err, req, res) => {
			logger.error('Opportunities service proxy error:', err)
			res.status(503).json({ error: 'Opportunities service unavailable' })
		},
	})
)

// Tasks
app.use(
	'/api/v1/tasks',
	validateTenantLimits('tasks'),
	createProxyMiddleware({
		target: serviceRegistry.getService('crm').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/tasks': '/api/v1/tasks', // Tasks might be on different path
		},
		onError: (err, req, res) => {
			logger.error('Tasks service proxy error:', err)
			res.status(503).json({ error: 'Tasks service unavailable' })
		},
	})
)

// Users (no limits needed)
app.use(
	'/api/v1/users',
	createProxyMiddleware({
		target: serviceRegistry.getService('crm').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/users': '/users',
		},
		onError: (err, req, res) => {
			logger.error('Users service proxy error:', err)
			res.status(503).json({ error: 'Users service unavailable' })
		},
	})
)

// Admin routes (require admin role)
app.use(
	'/api/v1/admin',
	(req: any, res, next) => {
		if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
			return res.status(403).json({ error: 'Admin access required' })
		}
		next()
	},
	createProxyMiddleware({
		target: serviceRegistry.getService('crm').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/admin': '/api/v1/admin',
		},
		onError: (err, req, res) => {
			logger.error('Admin service proxy error:', err)
			res.status(503).json({ error: 'Admin service unavailable' })
		},
	})
)

// ===== NOTIFICATION SERVICE ROUTES =====
app.use(
	'/api/v1/notifications',
	createProxyMiddleware({
		target: serviceRegistry.getService('notifications').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/notifications': '/api/v1/notifications',
		},
		onError: (err, req, res) => {
			logger.error('Notification service proxy error:', err)
			res.status(503).json({ error: 'Notification service unavailable' })
		},
	})
)

// Manager endpoints
app.use(
	'/api/v1/manager',
	createProxyMiddleware({
		target: serviceRegistry.getService('notifications').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/manager': '/api/v1/manager',
		},
		onError: (err, req, res) => {
			logger.error('Manager proxy error:', err)
			res.status(503).json({ error: 'Manager service unavailable' })
		},
	})
)

// ===== TENANT CREATION ROUTE =====
// This should be the ONLY tenant creation route - remove any duplicates
app.use(
	'/:tenantId/api/v1/tenants',
	// Add debug logging first
	(req, res, next) => {
		console.log('🎯 Tenant creation route hit!')
		console.log('📍 URL:', req.originalUrl)
		console.log('🔧 Method:', req.method)
		console.log('🎫 Tenant ID:', req.params.tenantId)
		console.log(
			'🔑 Auth Header:',
			req.headers.authorization ? 'Present' : 'Missing'
		)
		next()
	},
	// Use authMiddleware to validate the internal token
	authMiddleware,
	// Add tenant ID to headers for downstream services
	(req, res, next) => {
		req.headers['X-Tenant-ID'] = req.params.tenantId
		console.log('🏷️ Added X-Tenant-ID header:', req.params.tenantId)
		next()
	},
	// Proxy to tenant orchestrator
	createProxyMiddleware({
		target: process.env.TENANT_ORCHESTRATOR_URL || 'http://localhost:8015',
		changeOrigin: true,
		pathRewrite: {
			'^/[^/]+/api/v1/tenants': '/api/v1/tenants', // Remove tenant prefix
		},
		onProxyReq: (proxyReq, req, res) => {
			const tenantId = req.params.tenantId
			proxyReq.setHeader('X-Tenant-ID', tenantId)

			console.log('🔄 Proxying tenant creation request', {
				tenantId,
				method: req.method,
				originalUrl: req.originalUrl,
				targetUrl: proxyReq.path,
				target: process.env.TENANT_ORCHESTRATOR_URL || 'http://localhost:8015',
			})

			// Handle POST body forwarding
			if (req.body && (req.method === 'POST' || req.method === 'PUT')) {
				const bodyData = JSON.stringify(req.body)
				proxyReq.setHeader('Content-Type', 'application/json')
				proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData))
				proxyReq.write(bodyData)
			}
		},
		onProxyRes: (proxyRes, req, res) => {
			console.log('📥 Tenant orchestrator response:', {
				statusCode: proxyRes.statusCode,
				statusMessage: proxyRes.statusMessage,
			})
		},
		onError: (err, req, res) => {
			console.error('❌ Tenant orchestrator proxy error:', err)
			res.status(503).json({ error: 'Tenant orchestrator service unavailable' })
		},
	})
)

// ===== MESSAGING SERVICE ROUTES =====
app.use(
	'/api/v1/messaging',
	createProxyMiddleware({
		target: serviceRegistry.getService('crm').url, // Or messaging service if separate
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/messaging': '/api/v1/messaging',
		},
		onError: (err, req, res) => {
			logger.error('Messaging proxy error:', err)
			res.status(503).json({ error: 'Messaging service unavailable' })
		},
	})
)

app.use(
	'/api/v1/tenants',
	validateTenantLimits('tenants'), // Optional: Add if tenant limits apply
	createProxyMiddleware({
		target: serviceRegistry.getService('crm').url,
		changeOrigin: true,
		pathRewrite: {
			'^/api/v1/tenants': '/api/v1/tenants', // Preserve the full path
		},
		onError: (err, req, res) => {
			logger.error('Tenants service proxy error:', err)
			res.status(503).json({ error: 'Tenants service unavailable' })
		},
	})
)

// ===== TENANT INFORMATION ENDPOINT =====
app.get('/:tenantId/api/v1/tenant/current', (req: any, res) => {
	if (!req.tenant) {
		return res.status(400).json({ error: 'No tenant context' })
	}
	res.json({
		tenant: req.tenant,
		user: {
			id: req.user.id,
			email: req.user.email,
			role: req.user.role,
		},
	})
})

// ===== KWORK INTEGRATION =====
app.use('/api/v1/kwork', kworkRoutes)

// ===== TENANT INFORMATION ENDPOINT =====
app.get('/api/v1/tenant/current', (req: any, res) => {
	if (!req.tenant) {
		return res.status(400).json({ error: 'No tenant context' })
	}

	res.json({
		tenant: req.tenant,
		user: {
			id: req.user.id,
			email: req.user.email,
			role: req.user.role,
		},
	})
})

// Error handling middleware
app.use(errorHandler)

// 404 handler
app.use('*', (req, res) => {
	res.status(404).json({ error: 'Endpoint not found' })
})

// Start server
const PORT = config.port || 3001
app.listen(PORT, () => {
	logger.info(`🚀 Enhanced API Gateway started on port ${PORT}`)
	logger.info(`Environment: ${config.environment}`)
	logger.info('Multi-tenancy: ENABLED')
	logger.info('Tenant caching: ENABLED (Redis)')
	logger.info('Rate limiting: Per-tenant enabled')
	logger.info(
		'Services:',
		serviceRegistry.listServices().map(s => s.name)
	)
})

// Graceful shutdown
process.on('SIGTERM', () => {
	logger.info('SIGTERM received, shutting down gracefully')
	process.exit(0)
})

process.on('SIGINT', () => {
	logger.info('SIGINT received, shutting down gracefully')
	process.exit(0)
})
