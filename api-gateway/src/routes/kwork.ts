import { Router } from 'express';
import { serviceRegistry } from '../services/serviceRegistry';
import { logger } from '../utils/logger';

const router = Router();

// Proxy middleware for Kwork service
const proxyToKworkService = async (req: any, res: any) => {
  try {
    const kworkService = serviceRegistry.getService('kwork');
    
    if (kworkService.status !== 'available') {
      logger.warn('Kwork service is unavailable', { 
        service: kworkService.name, 
        status: kworkService.status 
      });
      return res.status(503).json({ 
        error: 'Kwork service is currently unavailable' 
      });
    }

    // Forward the request to Kwork service
    const targetUrl = `${kworkService.url}${req.url}`;
    
    logger.debug('Proxying request to Kwork service', {
      method: req.method,
      originalUrl: req.url,
      targetUrl,
    });

    // Forward headers
    const headers: Record<string, string> = {};
    Object.keys(req.headers).forEach(key => {
      if (key.toLowerCase() !== 'host') {
        headers[key] = req.headers[key];
      }
    });

    // Add service identification header
    headers['X-Service-Proxy'] = 'api-gateway';

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    // Forward response headers
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Set response status
    res.status(response.status);

    // Forward response body
    const responseBody = await response.text();
    res.send(responseBody);

  } catch (error) {
    logger.error('Error proxying to Kwork service', {
      error: error instanceof Error ? error.message : String(error),
      url: req.url,
      method: req.method,
    });
    
    res.status(500).json({ 
      error: 'Internal server error while proxying to Kwork service' 
    });
  }
};

// Health check endpoint for Kwork service
router.get('/health', async (req, res) => {
  try {
    const kworkService = serviceRegistry.getService('kwork');
    res.json({
      service: 'kwork',
      status: kworkService.status,
      url: kworkService.url,
      lastCheck: kworkService.lastCheck,
    });
  } catch (error) {
    logger.error('Error checking Kwork service health', { error });
    res.status(500).json({ error: 'Failed to check Kwork service health' });
  }
});

// Proxy all other requests to Kwork service
router.use('*', proxyToKworkService);

export default router; 