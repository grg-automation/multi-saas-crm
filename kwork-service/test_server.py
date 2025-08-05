#!/usr/bin/env python3
"""
Простой тестовый сервер для kwork-service без базы данных
"""

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Kwork Service Test",
    description="Тестовая версия парсера Kwork без базы данных",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Kwork Service Test Server is running", 
        "docs": "/docs",
        "status": "ready"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "timestamp": time.time(),
        "service": "kwork-service-test"
    }

@app.get("/api/v1/test")
async def test_endpoint():
    return {
        "message": "API работает!",
        "endpoints": [
            "/api/v1/auth",
            "/api/v1/accounts", 
            "/api/v1/orders",
            "/api/v1/chat",
            "/api/v1/gigs",
            "/api/v1/crm-sync"
        ]
    }

@app.get("/api/v1/auth/test")
async def auth_test():
    return {
        "message": "Аутентификация работает",
        "status": "ready"
    }

@app.get("/api/v1/orders/test")
async def orders_test():
    return {
        "message": "Заказы API работает",
        "status": "ready",
        "note": "Для реального парсинга нужны учетные данные Kwork"
    }

@app.get("/api/v1/accounts/test")
async def accounts_test():
    return {
        "message": "Аккаунты API работает",
        "status": "ready"
    }

@app.get("/api/v1/chat/test")
async def chat_test():
    return {
        "message": "Чат API работает",
        "status": "ready"
    }

@app.get("/api/v1/gigs/test")
async def gigs_test():
    return {
        "message": "Кворки API работает",
        "status": "ready"
    }

@app.get("/api/v1/crm-sync/test")
async def crm_sync_test():
    return {
        "message": "CRM синхронизация API работает",
        "status": "ready",
        "note": "Для реальной синхронизации нужна CRM система"
    }

# Middleware для логирования запросов
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    logger.info(f"Request: {request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s")
    
    return response

if __name__ == "__main__":
    print("🚀 Запуск тестового сервера Kwork Service...")
    print("📍 Документация: http://localhost:8000/docs")
    print("🔍 Health check: http://localhost:8000/health")
    print("🧪 Тестовые endpoints: http://localhost:8000/api/v1/test")
    
    uvicorn.run(
        "test_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    ) 