import uvicorn
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging
from typing import Optional
import time

from app.core.config import settings
from app.core.rate_limiter import RateLimiter
# from app.core.database import init_db  # Отключаем БД
from app.core.security import verify_token, get_current_user
from app.api.v1.auth import auth_router
from app.api.v1.accounts import accounts_router
from app.api.v1.orders import orders_router
from app.api.v1.chat import chat_router
from app.api.v1.quark import quark_router
from app.api.v1.gigs import gigs_router
from app.api.v1.files import files_router
from app.api.v1.crm_sync import crm_sync_router
from app.core.forbidden_routes import FORBIDDEN_ROUTES
from app.api.v1.project import projects_router

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Глобальный rate limiter
rate_limiter = RateLimiter(max_requests=60, time_window=60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Отключаем инициализацию БД для тестирования
    # await init_db()
    logger.info("Application started (NO DATABASE MODE)")
    yield
    logger.info("Application shutdown")

app = FastAPI(
    title="Kwork Parser API (No DB Mode)",
    description="Система парсинга и автоматизации работы с платформой Kwork.ru - Режим без базы данных",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware для блокировки запрещенных маршрутов
@app.middleware("http")
async def block_forbidden_routes(request: Request, call_next):
    path = request.url.path
    
    # Проверка запрещенных маршрутов
    for forbidden_path in FORBIDDEN_ROUTES:
        if path.startswith(forbidden_path):
            logger.warning(f"Blocked access to forbidden route: {path}")
            return JSONResponse(
                status_code=403,
                content={"error": "Access to this resource is forbidden"}
            )
    
    response = await call_next(request)
    return response

# Middleware для rate limiting
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host
    user_agent = request.headers.get("user-agent", "")
    
    # Проверка rate limit
    if not await rate_limiter.allow_request(client_ip):
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Maximum 60 requests per minute."}
        )
    
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    # Логирование запроса
    logger.info(f"Request: {request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s")
    
    return response

# Подключение роутеров
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(accounts_router, prefix="/api/v1/accounts", tags=["Accounts"])
app.include_router(orders_router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])
app.include_router(quark_router, prefix="/api/v1/quark", tags=["Quark"])
app.include_router(gigs_router, prefix="/api/v1/gigs", tags=["Gigs"])
app.include_router(files_router, prefix="/api/v1/files", tags=["Files"])
app.include_router(crm_sync_router, prefix="/api/v1/crm-sync", tags=["CRM Integration"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["Projects"])

@app.get("/")
async def root():
    return {
        "message": "Kwork Parser API is running (No Database Mode)", 
        "docs": "/docs",
        "status": "ready",
        "note": "Running without database for testing"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "timestamp": time.time(),
        "service": "kwork-parser",
        "mode": "no-database"
    }

@app.get("/api/v1/test")
async def test_endpoint():
    return {
        "message": "API работает в режиме без базы данных!",
        "available_endpoints": [
            "/api/v1/auth",
            "/api/v1/accounts", 
            "/api/v1/orders",
            "/api/v1/chat",
            "/api/v1/gigs",
            "/api/v1/crm-sync",
            "/api/v1/projects"
        ],
        "docs": "/docs",
        "note": "Некоторые функции могут быть ограничены без базы данных"
    }

if __name__ == "__main__":
    print("🚀 Запуск Kwork Parser API (режим без базы данных)...")
    print("📍 Документация: http://localhost:8000/docs")
    print("🔍 Health check: http://localhost:8000/health")
    print("🧪 Тестовый endpoint: http://localhost:8000/api/v1/test")
    print("⚠️  Режим без базы данных - некоторые функции ограничены")
    
    uvicorn.run(
        "main_no_db:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    ) 