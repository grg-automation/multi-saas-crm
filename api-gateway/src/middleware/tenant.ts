import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger'

interface TenantRequest extends Request {
	tenant?: {
		id: string
		name: string
		status: string
	}
}

import axios from 'axios'

export const tenantMiddleware = async (
	req: TenantRequest,
	res: Response,
	next: NextFunction
): Promise<void> => {
	try {
		const token = req.headers.authorization?.split(' ')[1]
		let tenantId = 'default-tenant'
		if (token) {
			const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY) as {
				tenant_id?: string
			}
			tenantId = decoded.tenant_id || 'default-tenant'
		}
		// Validate tenant via CRM service
		const tenantResponse = await axios.get(
			`${process.env.CRM_SERVICE_URL}/api/v1/tenants/${tenantId}`,
			{
				headers: { 'x-tenant-id': tenantId },
			}
		)
		const { name, status } = tenantResponse.data
		req.tenant = { id: tenantId, name, status }
		req.headers['x-tenant-id'] = tenantId
		logger.debug('Tenant set:', req.tenant)
		next()
	} catch (error) {
		logger.error('Tenant error:', error)
		if (axios.isAxiosError(error) && error.response?.status === 404) {
			res.status(403).json({ error: 'Invalid tenant' })
		} else {
			res.status(500).json({ error: 'Tenant validation failed' })
		}
	}
}
