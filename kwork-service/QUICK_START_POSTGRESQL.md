# Быстрый переход на PostgreSQL

## 🚀 Автоматическая настройка (рекомендуется)

```bash
python3 setup_postgresql.py
```

Этот скрипт автоматически:
- Проверит Docker
- Запустит PostgreSQL
- Создаст .env файл
- Установит зависимости
- Инициализирует БД
- Мигрирует данные из SQLite (если есть)
- Протестирует подключение

## 📋 Ручная настройка

### 1. Запуск PostgreSQL
```bash
docker-compose -f docker-compose.postgresql.yml up -d
```

### 2. Установка зависимостей
```bash
pip install -r requirements.txt
```

### 3. Создание .env файла
```bash
cat > .env << EOF
# PostgreSQL настройки
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
EOF
```

### 4. Инициализация БД
```bash
python3 -c "import asyncio; from app.core.database import init_db; asyncio.run(init_db())"
```

### 5. Миграция данных (если есть SQLite)
```bash
python3 migrate_to_postgresql.py
```

### 6. Тестирование
```bash
python3 -c "
import asyncio
from app.core.database import db

async def test():
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchval('SELECT 1')
        print(f'✅ Подключение успешно! Результат: {result}')

asyncio.run(test())
"
```

## 🎯 Управление

### pgAdmin (веб-интерфейс)
- URL: http://localhost:5050
- Логин: admin@kwork.com
- Пароль: admin

### Командная строка
```bash
docker exec -it kwork_postgres psql -U postgres -d kwork_hub
```

### Основные команды PostgreSQL
```sql
\dt          -- показать таблицы
\d table_name -- описание таблицы
SELECT * FROM users LIMIT 5;  -- пример запроса
\q           -- выход
```

## 🔧 Полезные команды

### Остановка PostgreSQL
```bash
docker-compose -f docker-compose.postgresql.yml down
```

### Просмотр логов
```bash
docker logs kwork_postgres
```

### Резервное копирование
```bash
docker exec kwork_postgres pg_dump -U postgres kwork_hub > backup.sql
```

### Восстановление
```bash
docker exec -i kwork_postgres psql -U postgres kwork_hub < backup.sql
```

## ⚠️ Важные изменения

1. **Параметры запросов**: `?` → `$1, $2, ...`
2. **Типы данных**: `TEXT` → `VARCHAR(255)`
3. **Автоинкремент**: `AUTOINCREMENT` → `SERIAL`
4. **Пул соединений**: Используется asyncpg

## 🆘 Устранение неполадок

### PostgreSQL не запускается
```bash
docker ps  # проверьте статус контейнеров
docker logs kwork_postgres  # посмотрите логи
```

### Ошибка подключения
- Проверьте .env файл
- Убедитесь, что PostgreSQL запущен
- Проверьте порт 5432

### Ошибка миграции
- Убедитесь, что файл kwork_hub.db существует
- Проверьте права доступа к файлу

## 📊 Мониторинг

### Статус контейнеров
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Использование ресурсов
```bash
docker stats kwork_postgres
```

### Проверка готовности
```bash
docker exec kwork_postgres pg_isready -U postgres
``` 