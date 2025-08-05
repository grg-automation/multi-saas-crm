# Миграция на PostgreSQL

Этот проект был успешно мигрирован с SQLite на PostgreSQL для улучшения производительности и масштабируемости.

## 🎯 Преимущества PostgreSQL

- **Лучшая производительность** при большом количестве данных
- **Поддержка конкурентных запросов** и транзакций ACID
- **Продвинутое индексирование** и оптимизация запросов
- **Масштабируемость** для растущих проектов
- **Надежность** и отказоустойчивость

## 🚀 Быстрый старт

### Автоматическая настройка (рекомендуется)

```bash
python3 setup_postgresql.py
```

### Ручная настройка

1. **Запуск PostgreSQL:**
   ```bash
   docker-compose -f docker-compose.postgresql.yml up -d
   ```

2. **Установка зависимостей:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Инициализация БД:**
   ```bash
   python3 -c "import asyncio; from app.core.database import init_db; asyncio.run(init_db())"
   ```

4. **Миграция данных (если есть SQLite):**
   ```bash
   python3 migrate_to_postgresql.py
   ```

## 📁 Измененные файлы

### Основные изменения:

1. **`app/core/database.py`** - полностью переписан для PostgreSQL
2. **`app/core/config.py`** - добавлены настройки PostgreSQL
3. **`requirements.txt`** - заменен aiosqlite на asyncpg
4. **`docker-compose.yml`** - добавлен сервис PostgreSQL
5. **`docker-compose.postgresql.yml`** - отдельный файл для PostgreSQL

### Новые файлы:

- `migrate_to_postgresql.py` - скрипт миграции данных
- `setup_postgresql.py` - автоматическая настройка
- `POSTGRESQL_MIGRATION.md` - подробная документация
- `QUICK_START_POSTGRESQL.md` - краткая инструкция

## 🔧 Ключевые отличия от SQLite

| Аспект | SQLite | PostgreSQL |
|--------|--------|------------|
| Параметры запросов | `?` | `$1, $2, ...` |
| Автоинкремент | `AUTOINCREMENT` | `SERIAL` |
| Типы данных | `TEXT` | `VARCHAR(255)` |
| Пул соединений | Нет | asyncpg.create_pool() |
| Транзакции | Ручные | Автоматические |

## 🗄️ Структура базы данных

### Таблицы:

- **`users`** - пользователи системы
- **`kwork_accounts`** - аккаунты Kwork
- **`account_info`** - информация об аккаунтах
- **`orders`** - заказы
- **`projects`** - проекты
- **`action_logs`** - логи действий
- **`sessions`** - сессии пользователей
- **`temp_files`** - временные файлы

### Связи:

```sql
users (1) ←→ (N) kwork_accounts
kwork_accounts (1) ←→ (N) account_info
kwork_accounts (1) ←→ (N) orders
users (1) ←→ (N) action_logs
users (1) ←→ (N) sessions
users (1) ←→ (N) temp_files
```

## 🎛️ Управление базой данных

### pgAdmin (веб-интерфейс)
- **URL:** http://localhost:5050
- **Логин:** admin@kwork.com
- **Пароль:** admin

### Командная строка
```bash
docker exec -it kwork_postgres psql -U postgres -d kwork_hub
```

### Основные команды PostgreSQL
```sql
\dt                    -- показать таблицы
\d table_name         -- описание таблицы
SELECT * FROM users;   -- пример запроса
\q                    -- выход
```

## 🔄 Миграция данных

### Автоматическая миграция
```bash
python3 migrate_to_postgresql.py
```

### Ручная миграция
```bash
# Экспорт из SQLite
sqlite3 kwork_hub.db ".dump" > sqlite_dump.sql

# Импорт в PostgreSQL (требует ручной обработки)
psql -U postgres -d kwork_hub < processed_dump.sql
```

## 📊 Мониторинг и обслуживание

### Резервное копирование
```bash
# Создание бэкапа
docker exec kwork_postgres pg_dump -U postgres kwork_hub > backup.sql

# Восстановление
docker exec -i kwork_postgres psql -U postgres kwork_hub < backup.sql
```

### Мониторинг производительности
```bash
# Статус контейнеров
docker ps

# Использование ресурсов
docker stats kwork_postgres

# Проверка готовности
docker exec kwork_postgres pg_isready -U postgres
```

### Логи
```bash
# Просмотр логов PostgreSQL
docker logs kwork_postgres

# Просмотр логов приложения
docker logs kwork_hub_api
```

## 🆘 Устранение неполадок

### Проблема: PostgreSQL не запускается
```bash
# Проверка статуса
docker ps

# Просмотр логов
docker logs kwork_postgres

# Перезапуск
docker-compose -f docker-compose.postgresql.yml restart
```

### Проблема: Ошибка подключения
```bash
# Проверка .env файла
cat .env

# Тест подключения
python3 -c "
import asyncio
from app.core.database import db
async def test():
    try:
        pool = await db.get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval('SELECT 1')
            print(f'✅ Подключение успешно: {result}')
    except Exception as e:
        print(f'❌ Ошибка: {e}')
asyncio.run(test())
"
```

### Проблема: Ошибка миграции
```bash
# Проверка файла SQLite
ls -la kwork_hub.db

# Проверка прав доступа
chmod 644 kwork_hub.db

# Ручная миграция таблицы
python3 -c "
import sqlite3
import asyncpg
import asyncio

async def migrate_table():
    # Подключение к SQLite
    sqlite_conn = sqlite3.connect('kwork_hub.db')
    sqlite_conn.row_factory = sqlite3.Row
    
    # Подключение к PostgreSQL
    pg_conn = await asyncpg.connect('postgresql://postgres:password@localhost:5432/kwork_hub')
    
    # Миграция данных
    cursor = sqlite_conn.execute('SELECT * FROM users')
    rows = cursor.fetchall()
    
    for row in rows:
        await pg_conn.execute('''
            INSERT INTO users (id, username, email, hashed_password, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO NOTHING
        ''', (row['id'], row['username'], row['email'], 
              row['hashed_password'], row['is_active'], row['created_at']))
    
    sqlite_conn.close()
    await pg_conn.close()
    print('✅ Миграция завершена')

asyncio.run(migrate_table())
"
```

## 🔄 Откат к SQLite

Если нужно вернуться к SQLite:

1. **Измените DATABASE_URL в .env:**
   ```env
   DATABASE_URL=sqlite:///./kwork_hub.db
   ```

2. **Восстановите старую версию database.py**

3. **Установите aiosqlite:**
   ```bash
   pip install aiosqlite
   pip uninstall asyncpg
   ```

4. **Остановите PostgreSQL:**
   ```bash
   docker-compose -f docker-compose.postgresql.yml down
   ```

## 📈 Производительность

### Оптимизация запросов
```sql
-- Создание индексов для ускорения
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_orders_account_id ON orders(account_id);
CREATE INDEX idx_action_logs_user_id ON action_logs(user_id);
```

### Мониторинг медленных запросов
```sql
-- Включение логирования медленных запросов
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
```

### Анализ производительности
```sql
-- Просмотр статистики таблиц
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE tablename = 'users';
```

## 🔐 Безопасность

### Настройка аутентификации
```sql
-- Создание пользователя только для чтения
CREATE USER readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE kwork_hub TO readonly;
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
```

### Шифрование соединений
```bash
# Включение SSL в PostgreSQL
docker run -d --name postgres_ssl \
  -e POSTGRES_PASSWORD=password \
  -v $(pwd)/ssl:/etc/ssl/certs \
  postgres:15 \
  -c ssl=on \
  -c ssl_cert_file=/etc/ssl/certs/server.crt \
  -c ssl_key_file=/etc/ssl/certs/server.key
```

## 📚 Дополнительные ресурсы

- [Документация PostgreSQL](https://www.postgresql.org/docs/)
- [Документация asyncpg](https://magicstack.github.io/asyncpg/)
- [Руководство по миграции](POSTGRESQL_MIGRATION.md)
- [Быстрый старт](QUICK_START_POSTGRESQL.md)

## 🤝 Поддержка

Если у вас возникли проблемы:

1. Проверьте логи: `docker logs kwork_postgres`
2. Убедитесь, что Docker запущен
3. Проверьте порты (5432, 5050)
4. Обратитесь к документации PostgreSQL

---

**Удачной работы с PostgreSQL! 🎉** 