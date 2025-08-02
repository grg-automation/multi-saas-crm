import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './utils/logger';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { loggingMiddleware } from './middleware/logging';
import { errorHandler } from './middleware/errorHandler';
import { serviceRegistry } from './services/serviceRegistry';
import { healthCheck } from './routes/health';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom middleware
app.use(loggingMiddleware);
// Temporarily disable tenant middleware
// app.use(tenantMiddleware);

// Health check endpoint
app.use('/health', healthCheck);

// ===== AUTHENTICATION ROUTES (Identity Service) =====
// Public auth routes - no auth middleware needed
app.use('/api/v1/auth', createProxyMiddleware({
  target: serviceRegistry.getService('auth').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/auth': '/api/v1/auth', // Keep the full path for identity-service
  },
  onError: (err, req, res) => {
    logger.error('Auth service proxy error:', err);
    res.status(503).json({ error: 'Auth service unavailable' });
  },
}));

// ===== NOTIFICATION SERVICE ROUTES =====
// Notification endpoints
app.use('/api/v1/notifications', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('notifications').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/notifications': '/api/v1/notifications',
  },
  onError: (err, req, res) => {
    logger.error('Notification service proxy error:', err);
    res.status(503).json({ error: 'Notification service unavailable' });
  },
}));

// Messaging endpoints (from CRM service)
app.use('/api/v1/messaging', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('crm').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/messaging': '/api/v1/messaging',
  },
  onError: (err, req, res) => {
    logger.error('Messaging proxy error:', err);
    res.status(503).json({ error: 'Messaging service unavailable' });
  },
}));

// Telegram User API V2 endpoints (from notification service)
app.use('/api/v1/telegram-user-v2', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('notifications').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/telegram-user-v2': '/api/v1/telegram-user-v2',
  },
  onError: (err, req, res) => {
    logger.error('Telegram V2 proxy error:', err);
    res.status(503).json({ error: 'Telegram V2 service unavailable' });
  },
}));

// Manager endpoints (from notification service)
app.use('/api/v1/manager', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('notifications').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/manager': '/api/v1/manager',
  },
  onError: (err, req, res) => {
    logger.error('Manager proxy error:', err);
    res.status(503).json({ error: 'Manager service unavailable' });
  },
}));

// ===== CORE CRM SERVICE ROUTES (Kotlin Spring Boot) =====
// All CRM routes go to the Kotlin service

// Admin routes - require authentication and admin role
// Route admin requests to notification-service manager endpoint which proxies to CRM
app.use('/api/v1/admin/assign-chat', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('notifications').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/admin/assign-chat': '/api/v1/manager/assign-chat', // Route to manager endpoint
  },
  onError: (err, req, res) => {
    logger.error('Admin assign-chat proxy error:', err);
    res.status(503).json({ error: 'Admin assign-chat service unavailable' });
  },
}));

// Admin managers list - route to notification-service
app.use('/api/v1/admin/managers', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('notifications').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/admin/managers': '/api/v1/manager/list', // Route to manager list endpoint
  },
  onError: (err, req, res) => {
    logger.error('Admin managers proxy error:', err);
    res.status(503).json({ error: 'Admin managers service unavailable' });
  },
}));

// Other admin routes go to CRM service
app.use('/api/v1/admin', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('crm').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/admin': '/api/v1/admin', // Keep full path
  },
  onError: (err, req, res) => {
    logger.error('Admin service proxy error:', err);
    res.status(503).json({ error: 'Admin service unavailable' });
  },
}));

// Users/Profile routes
app.use('/api/v1/users', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('crm').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/users': '/api/v1/users',
  },
  onError: (err, req, res) => {
    logger.error('Users service proxy error:', err);
    res.status(503).json({ error: 'Users service unavailable' });
  },
}));

// Contacts routes
app.use('/api/v1/contacts', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('crm').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/contacts': '/api/v1/contacts',
  },
  onError: (err, req, res) => {
    logger.error('Contacts service proxy error:', err);
    res.status(503).json({ error: 'Contacts service unavailable' });
  },
}));

// Companies routes
app.use('/api/v1/companies', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('crm').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/companies': '/api/v1/companies',
  },
  onError: (err, req, res) => {
    logger.error('Companies service proxy error:', err);
    res.status(503).json({ error: 'Companies service unavailable' });
  },
}));

// Opportunities/Deals routes
app.use('/api/v1/opportunities', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('crm').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/opportunities': '/api/v1/opportunities',
  },
  onError: (err, req, res) => {
    logger.error('Opportunities service proxy error:', err);
    res.status(503).json({ error: 'Opportunities service unavailable' });
  },
}));

// Dashboard routes
app.use('/api/v1/dashboard', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('crm').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/dashboard': '/api/v1/dashboard',
  },
  onError: (err, req, res) => {
    logger.error('Dashboard service proxy error:', err);
    res.status(503).json({ error: 'Dashboard service unavailable' });
  },
}));

// Inbox/Messaging routes (CRM handles message storage and threading)
app.use('/api/v1/inbox', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('crm').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/inbox': '/api/v1/inbox',
  },
  onError: (err, req, res) => {
    logger.error('Inbox service proxy error:', err);
    res.status(503).json({ error: 'Inbox service unavailable' });
  },
}));

// Manager routes (from notification service)
app.use('/api/v1/manager', authMiddleware, createProxyMiddleware({
  target: serviceRegistry.getService('notifications').url,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/manager': '/api/v1/manager',
  },
  onError: (err, req, res) => {
    logger.error('Manager service proxy error:', err);
    res.status(503).json({ error: 'Manager service unavailable' });
  },
}));

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const PORT = config.port || 3001;
app.listen(PORT, () => {
  logger.info(`API Gateway started on port ${PORT}`);
  logger.info(`Environment: ${config.environment}`);
  logger.info('Services:', serviceRegistry.listServices());
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});