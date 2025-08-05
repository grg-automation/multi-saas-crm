#!/usr/bin/env python3
"""
Скрипт для автоматической настройки PostgreSQL
"""

import asyncio
import os
import sys
import subprocess
import time
from pathlib import Path

async def setup_postgresql():
    """Автоматическая настройка PostgreSQL"""
    print("🚀 Начинаем настройку PostgreSQL для проекта Kwork Parser...")
    
    # 1. Проверяем Docker
    print("\n1. Проверяем Docker...")
    try:
        result = subprocess.run(['docker', '--version'], capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ Docker не установлен или не запущен!")
            print("Установите Docker Desktop и запустите его.")
            return False
        print("✅ Docker найден:", result.stdout.strip())
    except FileNotFoundError:
        print("❌ Docker не найден в системе!")
        return False
    
    # 2. Запускаем PostgreSQL
    print("\n2. Запускаем PostgreSQL...")
    try:
        # Останавливаем существующие контейнеры
        subprocess.run(['docker-compose', '-f', 'docker-compose.postgresql.yml', 'down'], 
                      capture_output=True)
        
        # Запускаем PostgreSQL
        result = subprocess.run(['docker-compose', '-f', 'docker-compose.postgresql.yml', 'up', '-d'],
                              capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ Ошибка запуска PostgreSQL:", result.stderr)
            return False
        print("✅ PostgreSQL запущен")
        
        # Ждем готовности PostgreSQL
        print("⏳ Ждем готовности PostgreSQL...")
        for i in range(30):
            try:
                result = subprocess.run(['docker', 'exec', 'kwork_postgres', 'pg_isready', '-U', 'postgres'],
                                      capture_output=True, text=True)
                if result.returncode == 0:
                    print("✅ PostgreSQL готов к работе")
                    break
            except:
                pass
            time.sleep(2)
        else:
            print("❌ PostgreSQL не готов после 60 секунд ожидания")
            return False
            
    except Exception as e:
        print(f"❌ Ошибка при запуске PostgreSQL: {e}")
        return False
    
    # 3. Создаем .env файл
    print("\n3. Создаем .env файл...")
    env_content = """# PostgreSQL настройки
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=kwork_hub
DATABASE_URL=postgresql://postgres:password@localhost:5432/kwork_hub

# Безопасность
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Redis
REDIS_URL=redis://localhost:6379

# Настройки Kwork
KWORK_BASE_URL=https://kwork.ru
KWORK_API_URL=https://kwork.ru/api

# Rate limiting
MAX_REQUESTS_PER_MINUTE=60

# Файлы
MAX_FILE_SIZE=20971520
UPLOAD_DIR=./uploads

# Логирование
LOG_LEVEL=INFO

# Задержки
MIN_DELAY=1.0
MAX_DELAY=3.0
"""
    
    with open('.env', 'w', encoding='utf-8') as f:
        f.write(env_content)
    print("✅ .env файл создан")
    
    # 4. Устанавливаем зависимости
    print("\n4. Устанавливаем зависимости...")
    try:
        result = subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'],
                              capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ Ошибка установки зависимостей:", result.stderr)
            return False
        print("✅ Зависимости установлены")
    except Exception as e:
        print(f"❌ Ошибка при установке зависимостей: {e}")
        return False
    
    # 5. Инициализируем базу данных
    print("\n5. Инициализируем базу данных...")
    try:
        # Добавляем текущую директорию в PYTHONPATH
        sys.path.insert(0, str(Path.cwd()))
        
        from app.core.database import init_db
        await init_db()
        print("✅ База данных инициализирована")
    except Exception as e:
        print(f"❌ Ошибка инициализации БД: {e}")
        return False
    
    # 6. Мигрируем данные (если есть SQLite файл)
    if Path('kwork_hub.db').exists():
        print("\n6. Обнаружен файл SQLite, выполняем миграцию данных...")
        try:
            from migrate_to_postgresql import DataMigrator
            migrator = DataMigrator()
            await migrator.migrate_data()
            print("✅ Данные успешно мигрированы")
        except Exception as e:
            print(f"❌ Ошибка миграции данных: {e}")
            return False
    else:
        print("\n6. Файл SQLite не найден, пропускаем миграцию данных")
    
    # 7. Тестируем подключение
    print("\n7. Тестируем подключение к базе данных...")
    try:
        from app.core.database import db
        pool = await db.get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval('SELECT 1')
            if result == 1:
                print("✅ Подключение к PostgreSQL успешно!")
            else:
                print("❌ Неожиданный результат теста подключения")
                return False
    except Exception as e:
        print(f"❌ Ошибка тестирования подключения: {e}")
        return False
    
    print("\n🎉 Настройка PostgreSQL завершена успешно!")
    print("\n📋 Следующие шаги:")
    print("1. Запустите приложение: python3 main.py")
    print("2. Откройте pgAdmin: http://localhost:5050")
    print("   - Логин: admin@kwork.com")
    print("   - Пароль: admin")
    print("3. Для управления БД через командную строку:")
    print("   docker exec -it kwork_postgres psql -U postgres -d kwork_hub")
    
    return True

async def main():
    """Основная функция"""
    try:
        success = await setup_postgresql()
        if success:
            print("\n✅ Все готово! Можете запускать приложение.")
        else:
            print("\n❌ Настройка не завершена. Проверьте ошибки выше.")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n⏹️ Настройка прервана пользователем")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Неожиданная ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main()) 