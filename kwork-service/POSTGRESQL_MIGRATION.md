# Миграция на PostgreSQL

Этот документ описывает процесс миграции проекта с SQLite на PostgreSQL.

## Предварительные требования

1. Установленный Docker и Docker Compose
2. Python 3.8+
3. Доступ к интернету для загрузки образов

## Шаги миграции

### 1. Установка зависимостей

```bash
pip install -r requirements.txt
```

### 2. Запуск PostgreSQL

```bash
docker-compose -f docker-compose.postgresql.yml up -d
```

Это запустит:
- PostgreSQL на порту 5432
- pgAdmin на порту 5050 (для управления БД)

### 3. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
# PostgreSQL настройки
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=kwork_hub
DATABASE_URL=postgresql://postgres:password@localhost:5432/kwork_hub

# Остальные настройки...
SECRET_KEY=your-secret-key-change-in-production
```

### 4. Инициализация базы данных

```bash
python3 -c "import asyncio; from app.core.database import init_db; asyncio.run(init_db())"
```

### 5. Миграция данных (если есть существующие данные)

Если у вас есть данные в SQLite, выполните миграцию:

```bash
python3 migrate_to_postgresql.py
```

### 6. Тестирование подключения

```bash
python3 -c "
import asyncio
from app.core.database import db

async def test_connection():
    try:
        pool = await db.get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval('SELECT 1')
            print(f'Подключение успешно! Результат: {result}')
    except Exception as e:
        print(f'Ошибка подключения: {e}')

asyncio.run(test_connection())
"
```

## Изменения в коде

### Основные изменения:

1. **database.py** - полностью переписан для работы с asyncpg
2. **config.py** - добавлены настройки PostgreSQL
3. **requirements.txt** - заменен aiosqlite на asyncpg

### Ключевые отличия PostgreSQL от SQLite:

1. **Параметры запросов**: `?` → `$1, $2, ...`
2. **Типы данных**: `TEXT` → `VARCHAR(255)`, `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
3. **Пул соединений**: Используется asyncpg.create_pool()
4. **Транзакции**: Автоматические в PostgreSQL

## Управление базой данных

### Через pgAdmin:
1. Откройте http://localhost:5050
2. Логин: admin@kwork.com
3. Пароль: admin
4. Добавьте сервер PostgreSQL:
   - Host: postgres
   - Port: 5432
   - Database: kwork_hub
   - Username: postgres
   - Password: password

### Через командную строку:

```bash
# Подключение к контейнеру
docker exec -it kwork_postgres psql -U postgres -d kwork_hub

# Основные команды PostgreSQL
\dt          # показать таблицы
\d table_name # описание таблицы
\q           # выход
```

## Структура таблиц

После миграции у вас будут следующие таблицы:

- `users` - пользователи системы
- `kwork_accounts` - аккаунты Kwork
- `account_info` - информация об аккаунтах
- `orders` - заказы
- `projects` - проекты
- `action_logs` - логи действий
- `sessions` - сессии пользователей
- `temp_files` - временные файлы

## Резервное копирование

### Создание бэкапа:
```bash
docker exec kwork_postgres pg_dump -U postgres kwork_hub > backup.sql
```

### Восстановление из бэкапа:
```bash
docker exec -i kwork_postgres psql -U postgres kwork_hub < backup.sql
```

## Устранение неполадок

### Проблема: Не удается подключиться к PostgreSQL
```bash
# Проверьте статус контейнера
docker ps

# Проверьте логи
docker logs kwork_postgres
```

### Проблема: Ошибка аутентификации
Убедитесь, что в `.env` файле указаны правильные учетные данные.

### Проблема: Таблица не найдена
Выполните инициализацию базы данных:
```bash
python3 -c "import asyncio; from app.core.database import init_db; asyncio.run(init_db())"
```

## Производительность

PostgreSQL обеспечивает:
- Лучшую производительность при большом количестве данных
- Поддержку конкурентных запросов
- Транзакционность ACID
- Индексирование и оптимизацию запросов

## Откат к SQLite

Если нужно вернуться к SQLite:

1. Измените `DATABASE_URL` в `.env` на `sqlite:///./kwork_hub.db`
2. Восстановите старую версию `database.py`
3. Установите `aiosqlite` вместо `asyncpg` 