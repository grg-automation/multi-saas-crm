import dotenv from 'dotenv'

dotenv.config()

export const config = {
	environment: process.env.NODE_ENV || 'development',
	port: parseInt(process.env.PORT || '3002', 10),

	// JWT Configuration
	jwt: {
		secret:
			process.env.JWT_SECRET ||
			'dev_jwt_secret_key_for_messaging_system_at_least_32_chars',
		expiresIn: process.env.JWT_EXPIRES_IN || '24h',
	},

	// Redis Configuration for tenant caching
	redis: {
		host: process.env.REDIS_HOST || 'localhost',
		port: parseInt(process.env.REDIS_PORT || '6379', 10),
		password: process.env.REDIS_PASSWORD,
		db: parseInt(process.env.REDIS_DB || '0', 10),
	},

	// CORS Configuration
	cors: {
		origin: process.env.CORS_ORIGIN || 'http://localhost:3009',
	},

	// Services Configuration
	services: {
		// Identity Service (NestJS) - Authentication & User Management
		auth: {
			url: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
			timeout: 30000,
		},

		// Core CRM Service (Kotlin Spring Boot) - Main CRM functionality
		crm: {
			url: process.env.CRM_SERVICE_URL || 'http://localhost:8080',
			username: process.env.CRM_SERVICE_USERNAME || 'user', // Match default username
			password:
				process.env.CRM_SERVICE_PASSWORD ||
				'6ff28d72-5431-4dcb-a583-0df46e5a0579', // Use generated password
			timeout: 30000,
		},

		// Notification Service (NestJS) - Multi-channel notifications
		notifications: {
			url: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003',
			timeout: 30000,
		},

		// Messaging Service - Chat and messaging
		messaging: {
			url: process.env.MESSAGING_SERVICE_URL || 'http://localhost:3004',
			timeout: 30000,
		},

		// Kwork Integration
		kwork: {
			url: process.env.KWORK_SERVICE_URL || 'http://kwork-service:8000',
			timeout: 30000,
		},

		// === ADDITIONAL MICROSERVICES ===
		analytics: {
			url: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8005',
			timeout: 30000,
		},

		erp: {
			url: process.env.ERP_SERVICE_URL || 'http://erp-service:8006',
			timeout: 30000,
		},

		marketing: {
			url: process.env.MARKETING_SERVICE_URL || 'http://marketing-service:8007',
			timeout: 30000,
		},

		ai: {
			url: process.env.AI_SERVICE_URL || 'http://ai-service:8008',
			timeout: 30000,
		},

		plugins: {
			url: process.env.PLUGINS_SERVICE_URL || 'http://plugins-system:8009',
			timeout: 30000,
		},

		customFields: {
			url:
				process.env.CUSTOM_FIELDS_SERVICE_URL ||
				'http://custom-fields-service:8010',
			timeout: 30000,
		},

		workflow: {
			url: process.env.WORKFLOW_SERVICE_URL || 'http://workflow-engine:8012',
			timeout: 30000,
		},

		eventIngestion: {
			url:
				process.env.EVENT_INGESTION_SERVICE_URL ||
				'http://event-ingestion-service:8013',
			timeout: 30000,
		},

		extensionRuntime: {
			url:
				process.env.EXTENSION_RUNTIME_SERVICE_URL ||
				'http://extension-runtime-service:8014',
			timeout: 30000,
		},

		tenantOrchestrator: {
			url:
				process.env.TENANT_ORCHESTRATOR_URL ||
				'http://tenant-orchestrator:8015',
			timeout: 30000,
		},
	},

	// Multi-tenancy Configuration
	multiTenancy: {
		cacheTimeoutSeconds: parseInt(
			process.env.TENANT_CACHE_TIMEOUT || '300',
			10
		), // 5 minutes
		rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60', 10), // 1 minute
		enableResourceLimits: process.env.ENABLE_RESOURCE_LIMITS !== 'false',
	},

	// Logging Configuration
	logging: {
		level: process.env.LOG_LEVEL || 'info',
		format: process.env.LOG_FORMAT || 'combined',
	},

	// Security Configuration
	security: {
		bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
		sessionSecret:
			process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
		internalServiceAuth:
			process.env.INTERNAL_SERVICE_AUTH || 'gateway-internal',
	},
}
