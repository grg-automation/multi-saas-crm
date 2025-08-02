-- Инициализация базы данных CRM Messaging System
-- Создание расширений для PostgreSQL

-- Создание расширения для UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Создание расширения для полнотекстового поиска
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Создание расширения для JSON функций
CREATE EXTENSION IF NOT EXISTS "postgres_fdw";

-- Создание схемы для приложения
CREATE SCHEMA IF NOT EXISTS app;

-- Создание дополнительных баз данных если нужно
SELECT 'CREATE DATABASE crm_messaging_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'crm_messaging_dev')\gexec

SELECT 'CREATE DATABASE crm_analytics_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'crm_analytics_dev')\gexec

-- Настройка Row Level Security для multi-tenancy
ALTER DATABASE crm_messaging_dev SET row_security = on;

-- Логирование инициализации
DO $$
BEGIN
    RAISE NOTICE 'CRM Messaging System database extensions initialized successfully';
    RAISE NOTICE 'Available databases: crm_messaging_dev, crm_analytics_dev';
    RAISE NOTICE 'Row Level Security enabled for multi-tenancy';
END $$; 