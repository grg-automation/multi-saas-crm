import asyncpg
from typing import Optional, Dict, Any, List
import json
import logging
from datetime import datetime
from .config import settings

logger = logging.getLogger(__name__)

class Database:
    """
    Асинхронный wrapper для PostgreSQL
    """
    
    def __init__(self, connection_string: str = None):
        self.connection_string = connection_string or settings.DATABASE_URL
        self._pool = None
    
    async def get_pool(self):
        """Получение пула соединений"""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.connection_string,
                min_size=5,
                max_size=20
            )
        return self._pool
    
    async def init_db(self):
        """Инициализация базы данных и создание таблиц"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            # Таблица пользователей системы
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    hashed_password VARCHAR(255) NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Таблица аккаунтов Kwork
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS kwork_accounts (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    login VARCHAR(255) NOT NULL,
                    encrypted_password VARCHAR(255) NOT NULL,
                    account_name VARCHAR(255),
                    session_data TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    last_login TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            """)
            
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS account_info (
                    id VARCHAR(255) PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    display_name VARCHAR(255),
                    full_name VARCHAR(255),
                    avatar_url TEXT,
                    location VARCHAR(255),
                    joined VARCHAR(255),
                    is_online BOOLEAN,
                    profession VARCHAR(255),
                    about_me TEXT,
                    skills TEXT,  -- JSON
                    last_seen TIMESTAMP,
                    account_id INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES kwork_accounts (id)
                )
            """)

            # Таблица заказов
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id VARCHAR(255) PRIMARY KEY,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    buyer_name VARCHAR(255),
                    buyer_url TEXT,
                    ordered_at VARCHAR(255),
                    time_left VARCHAR(255),
                    price INTEGER,
                    status VARCHAR(255),
                    message TEXT,
                    duration VARCHAR(255),
                    files TEXT,  -- JSON: [{name, url}]
                    account_id INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES kwork_accounts (id)
                )
            """)
            
            # Таблица проектов Kwork
            await conn.execute("""
               CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(255) PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                price INTEGER,
                price_max INTEGER,
                buyer_username VARCHAR(255),
                buyer_rating INTEGER,
                projects_posted INTEGER,
                hire_rate REAL,
                proposals_count INTEGER,
                time_left VARCHAR(255),
                is_viewed BOOLEAN,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            
            # Таблица логов действий
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS action_logs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER,
                    account_id INTEGER,
                    action_type VARCHAR(255) NOT NULL,
                    description TEXT,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    FOREIGN KEY (account_id) REFERENCES kwork_accounts (id)
                )
            """)
            
            # Таблица сессий
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    account_id INTEGER,
                    session_token VARCHAR(255) UNIQUE NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    FOREIGN KEY (account_id) REFERENCES kwork_accounts (id)
                )
            """)
            
            # Таблица временных файлов
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS temp_files (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    filename VARCHAR(255) NOT NULL,
                    filepath TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    content_type VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            """)
            
            logger.info("Database initialized successfully")
    
    async def execute_query(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """Выполнение SELECT запроса"""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)
            return dict(row) if row else None
    
    async def execute_many(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Выполнение SELECT запроса с множественным результатом"""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
    
    async def execute_insert(self, query: str, params: tuple = ()) -> int:
        """Выполнение INSERT запроса"""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(query, *params)
            return result
    
    async def execute_update(self, query: str, params: tuple = ()) -> int:
        """Выполнение UPDATE/DELETE запроса"""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(query, *params)
            return result
    
    async def log_action(self, user_id: int, account_id: Optional[int], 
                        action_type: str, description: str = None,
                        ip_address: str = None, user_agent: str = None):
        """Логирование действий пользователя"""
        await self.execute_insert(
            """INSERT INTO action_logs 
               (user_id, account_id, action_type, description, ip_address, user_agent) 
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
            (user_id, account_id, action_type, description, ip_address, user_agent)
        )
    
    async def cleanup_expired_sessions(self):
        """Очистка истекших сессий"""
        await self.execute_update(
            "DELETE FROM sessions WHERE expires_at < $1",
            (datetime.now(),)
        )
    
    async def cleanup_temp_files(self):
        """Очистка истекших временных файлов"""
        await self.execute_update(
            "DELETE FROM temp_files WHERE expires_at < $1",
            (datetime.now(),)
        )
    
    async def close(self):
        """Закрытие пула соединений"""
        if self._pool:
            await self._pool.close()

# Глобальный экземпляр базы данных
db = Database()

async def init_db():
    """Инициализация базы данных"""
    await db.init_db()

async def get_db():
    """Dependency для получения экземпляра базы данных"""
    return db