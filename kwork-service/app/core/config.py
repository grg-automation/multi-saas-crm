from pydantic_settings import BaseSettings
from typing import Optional
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings(BaseSettings):
    # Основные настройки
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    
    # Безопасность - читаем из .env
    SECRET_KEY: str = "your-secret-key-change-in-production"  # Will be overridden by .env
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # База данных PostgreSQL - читаем из .env
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "password"  # Will be overridden by .env
    POSTGRES_DB: str = "kwork_service"
    DATABASE_URL: Optional[str] = None  # Will be constructed or read from .env
    
    # Redis для кеширования и сессий
    REDIS_URL: str = "redis://localhost:6379"
    
    # Интеграция с основной CRM
    CRM_API_URL: str = "http://localhost:8080/api/v1"
    CRM_API_KEY: Optional[str] = None
    
    # API Gateway для аутентификации
    API_GATEWAY_URL: str = "http://localhost:3001"
    
    # Настройки Kwork
    KWORK_BASE_URL: str = "https://kwork.ru"
    KWORK_API_URL: str = "https://kwork.ru/api"
    
    # Kwork учетные данные - ОБЯЗАТЕЛЬНО из .env
    KWORK_TEST_USERNAME: Optional[str] = None
    KWORK_TEST_PASSWORD: Optional[str] = None
    
    # Rate limiting
    MAX_REQUESTS_PER_MINUTE: int = 60
    
    # Файлы
    MAX_FILE_SIZE: int = 20 * 1024 * 1024  # 20MB
    ALLOWED_FILE_TYPES: list = [".jpg", ".jpeg", ".png", ".pdf", ".docx", ".doc", ".zip", ".rar", ".txt"]
    UPLOAD_DIR: str = "./uploads"
    
    # Логирование
    LOG_LEVEL: str = "INFO"
    
    # Задержки для имитации человеческого поведения
    MIN_DELAY: float = 1.0
    MAX_DELAY: float = 3.0
    
    # Мультитенантность
    TENANT_ID_HEADER: str = "X-Tenant-ID"
    DEFAULT_TENANT_ID: str = "default"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Construct DATABASE_URL if not provided
        if not self.DATABASE_URL:
            self.DATABASE_URL = f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # This allows environment variables to override default values
        case_sensitive = False

settings = Settings()