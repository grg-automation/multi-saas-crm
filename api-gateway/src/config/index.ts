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

	// Redis Configuration
	redis: {
		host: process.env.REDIS_HOST || 'localhost',
		port: parseInt(process.env.REDIS_PORT || '6379', 10),
		password: process.env.REDIS_PASSWORD,
	},

	// CORS Configuration
	cors: {
		origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
	},

	// Services Configuration - CURRENT MICROSERVICES ARCHITECTURE
	services: {
		// === ACTIVE MICROSERVICES ===

		// Identity Service (NestJS) - Authentication & User Management
		auth: {
			url: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
			timeout: 30000,
		},

		// Core CRM Service (Kotlin Spring Boot) - All CRM business logic
		// Handles: users, contacts, companies, opportunities, dashboard, admin, manager inbox
		crm: {
			url: process.env.CRM_SERVICE_URL || 'http://core-crm:8080',
			timeout: 30000,
		},

		// Notification Service (NestJS) - Multi-channel notifications & messaging
		// Handles: notifications, messaging (Telegram, email, SMS), inbox threads
		notifications: {
			url:
				process.env.NOTIFICATION_SERVICE_URL ||
				'http://notification-service:3003',
			timeout: 30000,
		},

		kwork: {
			url: process.env.KWORK_SERVICE_URL || 'http://kwork-service:8081', // Adjust URL/port
			timeout: 30000,
		},

		// === NOT RUNNING SERVICES (disabled) ===
		// These services are not currently running, commenting out to avoid health check failures
		/*
    erp: {
      url: process.env.ERP_SERVICE_URL || 'http://erp-service:8006',
      timeout: 30000,
    },
    marketing: {
      url: process.env.MARKETING_SERVICE_URL || 'http://marketing-service:8007',
      timeout: 30000,
    },
    plugins: {
      url: process.env.PLUGINS_SERVICE_URL || 'http://plugins-service:8008',
      timeout: 30000,
    },
    customfields: {
      url: process.env.CUSTOM_FIELDS_SERVICE_URL || 'http://custom-fields-service:8009',
      timeout: 30000,
    },
    oauth2: {
      url: process.env.OAUTH2_SERVICE_URL || 'http://oauth2-service:8010',
      timeout: 30000,
    },
    workflow: {
      url: process.env.WORKFLOW_ENGINE_URL || 'http://workflow-engine:8011',
      timeout: 30000,
    },
    */
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
	},
}
