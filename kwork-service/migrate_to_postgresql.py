#!/usr/bin/env python3
"""
Скрипт для миграции данных из SQLite в PostgreSQL
"""

import asyncio
import sqlite3
import asyncpg
import json
import logging
from datetime import datetime
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DataMigrator:
    def __init__(self, sqlite_path: str = "kwork_hub.db"):
        self.sqlite_path = sqlite_path
        self.pg_connection_string = settings.DATABASE_URL
        
    async def migrate_data(self):
        """Основная функция миграции"""
        logger.info("Начинаем миграцию данных из SQLite в PostgreSQL...")
        
        # Подключаемся к PostgreSQL
        pg_conn = await asyncpg.connect(self.pg_connection_string)
        
        try:
            # Подключаемся к SQLite
            sqlite_conn = sqlite3.connect(self.sqlite_path)
            sqlite_conn.row_factory = sqlite3.Row
            
            # Мигрируем таблицы по порядку (с учетом зависимостей)
            await self._migrate_users(sqlite_conn, pg_conn)
            await self._migrate_kwork_accounts(sqlite_conn, pg_conn)
            await self._migrate_account_info(sqlite_conn, pg_conn)
            await self._migrate_orders(sqlite_conn, pg_conn)
            await self._migrate_projects(sqlite_conn, pg_conn)
            await self._migrate_action_logs(sqlite_conn, pg_conn)
            await self._migrate_sessions(sqlite_conn, pg_conn)
            await self._migrate_temp_files(sqlite_conn, pg_conn)
            
            logger.info("Миграция завершена успешно!")
            
        except Exception as e:
            logger.error(f"Ошибка при миграции: {e}")
            raise
        finally:
            sqlite_conn.close()
            await pg_conn.close()
    
    async def _migrate_users(self, sqlite_conn, pg_conn):
        """Миграция таблицы users"""
        logger.info("Мигрируем таблицу users...")
        
        cursor = sqlite_conn.execute("SELECT * FROM users")
        rows = cursor.fetchall()
        
        for row in rows:
            await pg_conn.execute("""
                INSERT INTO users (id, username, email, hashed_password, is_active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO NOTHING
            """, (
                row['id'], row['username'], row['email'], 
                row['hashed_password'], row['is_active'], row['created_at']
            ))
        
        logger.info(f"Мигрировано {len(rows)} записей из таблицы users")
    
    async def _migrate_kwork_accounts(self, sqlite_conn, pg_conn):
        """Миграция таблицы kwork_accounts"""
        logger.info("Мигрируем таблицу kwork_accounts...")
        
        cursor = sqlite_conn.execute("SELECT * FROM kwork_accounts")
        rows = cursor.fetchall()
        
        for row in rows:
            await pg_conn.execute("""
                INSERT INTO kwork_accounts (id, user_id, login, encrypted_password, 
                                         account_name, session_data, is_active, last_login, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
            """, (
                row['id'], row['user_id'], row['login'], row['encrypted_password'],
                row['account_name'], row['session_data'], row['is_active'], 
                row['last_login'], row['created_at']
            ))
        
        logger.info(f"Мигрировано {len(rows)} записей из таблицы kwork_accounts")
    
    async def _migrate_account_info(self, sqlite_conn, pg_conn):
        """Миграция таблицы account_info"""
        logger.info("Мигрируем таблицу account_info...")
        
        cursor = sqlite_conn.execute("SELECT * FROM account_info")
        rows = cursor.fetchall()
        
        for row in rows:
            await pg_conn.execute("""
                INSERT INTO account_info (id, username, display_name, full_name, avatar_url,
                                       location, joined, is_online, profession, about_me,
                                       skills, last_seen, account_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (id) DO NOTHING
            """, (
                row['id'], row['username'], row['display_name'], row['full_name'],
                row['avatar_url'], row['location'], row['joined'], row['is_online'],
                row['profession'], row['about_me'], row['skills'], row['last_seen'],
                row['account_id'], row['created_at']
            ))
        
        logger.info(f"Мигрировано {len(rows)} записей из таблицы account_info")
    
    async def _migrate_orders(self, sqlite_conn, pg_conn):
        """Миграция таблицы orders"""
        logger.info("Мигрируем таблицу orders...")
        
        cursor = sqlite_conn.execute("SELECT * FROM orders")
        rows = cursor.fetchall()
        
        for row in rows:
            await pg_conn.execute("""
                INSERT INTO orders (id, title, url, buyer_name, buyer_url, ordered_at,
                                 time_left, price, status, message, duration, files,
                                 account_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (id) DO NOTHING
            """, (
                row['id'], row['title'], row['url'], row['buyer_name'], row['buyer_url'],
                row['ordered_at'], row['time_left'], row['price'], row['status'],
                row['message'], row['duration'], row['files'], row['account_id'],
                row['created_at']
            ))
        
        logger.info(f"Мигрировано {len(rows)} записей из таблицы orders")
    
    async def _migrate_projects(self, sqlite_conn, pg_conn):
        """Миграция таблицы projects"""
        logger.info("Мигрируем таблицу projects...")
        
        cursor = sqlite_conn.execute("SELECT * FROM projects")
        rows = cursor.fetchall()
        
        for row in rows:
            await pg_conn.execute("""
                INSERT INTO projects (id, title, description, price, price_max, buyer_username,
                                   buyer_rating, projects_posted, hire_rate, proposals_count,
                                   time_left, is_viewed, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (id) DO NOTHING
            """, (
                row['id'], row['title'], row['description'], row['price'], row['price_max'],
                row['buyer_username'], row['buyer_rating'], row['projects_posted'],
                row['hire_rate'], row['proposals_count'], row['time_left'], row['is_viewed'],
                row['created_at']
            ))
        
        logger.info(f"Мигрировано {len(rows)} записей из таблицы projects")
    
    async def _migrate_action_logs(self, sqlite_conn, pg_conn):
        """Миграция таблицы action_logs"""
        logger.info("Мигрируем таблицу action_logs...")
        
        cursor = sqlite_conn.execute("SELECT * FROM action_logs")
        rows = cursor.fetchall()
        
        for row in rows:
            await pg_conn.execute("""
                INSERT INTO action_logs (id, user_id, account_id, action_type, description,
                                      ip_address, user_agent, timestamp)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
            """, (
                row['id'], row['user_id'], row['account_id'], row['action_type'],
                row['description'], row['ip_address'], row['user_agent'], row['timestamp']
            ))
        
        logger.info(f"Мигрировано {len(rows)} записей из таблицы action_logs")
    
    async def _migrate_sessions(self, sqlite_conn, pg_conn):
        """Миграция таблицы sessions"""
        logger.info("Мигрируем таблицу sessions...")
        
        cursor = sqlite_conn.execute("SELECT * FROM sessions")
        rows = cursor.fetchall()
        
        for row in rows:
            await pg_conn.execute("""
                INSERT INTO sessions (id, user_id, account_id, session_token, expires_at,
                                   is_active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO NOTHING
            """, (
                row['id'], row['user_id'], row['account_id'], row['session_token'],
                row['expires_at'], row['is_active'], row['created_at']
            ))
        
        logger.info(f"Мигрировано {len(rows)} записей из таблицы sessions")
    
    async def _migrate_temp_files(self, sqlite_conn, pg_conn):
        """Миграция таблицы temp_files"""
        logger.info("Мигрируем таблицу temp_files...")
        
        cursor = sqlite_conn.execute("SELECT * FROM temp_files")
        rows = cursor.fetchall()
        
        for row in rows:
            await pg_conn.execute("""
                INSERT INTO temp_files (id, user_id, filename, filepath, file_size,
                                     content_type, created_at, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
            """, (
                row['id'], row['user_id'], row['filename'], row['filepath'],
                row['file_size'], row['content_type'], row['created_at'], row['expires_at']
            ))
        
        logger.info(f"Мигрировано {len(rows)} записей из таблицы temp_files")

async def main():
    """Основная функция"""
    migrator = DataMigrator()
    await migrator.migrate_data()

if __name__ == "__main__":
    asyncio.run(main()) 