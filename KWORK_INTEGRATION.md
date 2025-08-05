# Интеграция Kwork Parser в CRM систему

## 📋 Обзор

Kwork Parser был успешно интегрирован в многотенантную CRM систему как отдельный микросервис `kwork-service`. Сервис обеспечивает:

- 🔗 **Интеграцию с Kwork.ru** - парсинг заказов, кворков, чатов
- 🔄 **Синхронизацию с CRM** - автоматическое создание лидов и контактов
- 🏢 **Мультитенантность** - поддержка множественных организаций
- 🔐 **Безопасность** - аутентификация через API Gateway

## 🚀 Быстрый запуск

### 1. Настройка переменных окружения

Создайте файл `.env` в директории `kwork-service/`:

```bash
cd multi-saas-crm/kwork-service
cp env.template .env
```

Отредактируйте `.env` файл:

```env
# Основные настройки
HOST=0.0.0.0
PORT=8000
DEBUG=false

# Безопасность
SECRET_KEY=dev_jwt_secret_key_unified_for_all_services_32_chars
CRM_API_KEY=dev_crm_api_key

# База данных (использует общую БД CRM)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=crm_user
POSTGRES_PASSWORD=crm_password
POSTGRES_DB=crm_messaging_dev
DATABASE_URL=postgresql://crm_user:crm_password@postgres:5432/crm_messaging_dev

# Redis
REDIS_URL=redis://redis:6379

# Интеграция с CRM
CRM_API_URL=http://core-crm:8080/api/v1
API_GATEWAY_URL=http://api-gateway:3001

# Kwork учетные данные (ОБЯЗАТЕЛЬНО заполнить)
KWORK_TEST_USERNAME=ваш_логин_kwork
KWORK_TEST_PASSWORD=ваш_пароль_kwork

# Мультитенантность
TENANT_ID_HEADER=X-Tenant-ID
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001
```

### 2. Запуск всей системы

```bash
# Из корневой директории проекта
cd multi-saas-crm

# Запуск всех сервисов включая kwork-service
docker-compose -f docker-compose.messaging.yml up --build
```

### 3. Проверка работоспособности

```bash
# Проверка kwork-service
curl http://localhost:8004/health

# Проверка через API Gateway
curl http://localhost:3001/api/v1/kwork/health

# Документация API
open http://localhost:8004/docs
```

## 📡 API Endpoints

### Через API Gateway (рекомендуется)

**Base URL**: `http://localhost:3001/api/v1/kwork`

#### Аутентификация
```bash
# Получение токена
curl -X POST "http://localhost:3001/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "test123"}'
```

#### Управление аккаунтами Kwork
```bash
# Список аккаунтов
curl -X GET "http://localhost:3001/api/v1/kwork/accounts" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Добавление аккаунта
curl -X POST "http://localhost:3001/api/v1/kwork/accounts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_kwork_username",
    "password": "your_kwork_password"
  }'
```

#### Работа с заказами
```bash
# Получение заказов
curl -X GET "http://localhost:3001/api/v1/kwork/orders" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Получение заказов с созданием лидов в CRM
curl -X GET "http://localhost:3001/api/v1/kwork/orders?create_leads=true" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id"
```

#### Синхронизация с CRM
```bash
# Синхронизация заказов с CRM
curl -X POST "http://localhost:3001/api/v1/kwork/crm-sync/sync-orders" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id" \
  -H "Content-Type: application/json" \
  -d '{
    "page": 1,
    "limit": 50,
    "category": "web-development"
  }'

# Синхронизация контактов
curl -X POST "http://localhost:3001/api/v1/kwork/crm-sync/sync-contacts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id"

# Статус синхронизации
curl -X GET "http://localhost:3001/api/v1/kwork/crm-sync/sync-status" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id"
```

### Прямой доступ к kwork-service

**Base URL**: `http://localhost:8004`

```bash
# Документация API
open http://localhost:8004/docs

# Health check
curl http://localhost:8004/health
```

## 🔧 Конфигурация

### Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| `HOST` | Хост для запуска сервиса | `0.0.0.0` |
| `PORT` | Порт для запуска сервиса | `8000` |
| `DEBUG` | Режим отладки | `false` |
| `SECRET_KEY` | Секретный ключ для JWT | `dev_jwt_secret_key_unified_for_all_services_32_chars` |
| `CRM_API_KEY` | API ключ для доступа к CRM | `dev_crm_api_key` |
| `POSTGRES_HOST` | Хост PostgreSQL | `postgres` |
| `POSTGRES_PORT` | Порт PostgreSQL | `5432` |
| `POSTGRES_USER` | Пользователь PostgreSQL | `crm_user` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | `crm_password` |
| `POSTGRES_DB` | База данных PostgreSQL | `crm_messaging_dev` |
| `REDIS_URL` | URL Redis | `redis://redis:6379` |
| `CRM_API_URL` | URL CRM API | `http://core-crm:8080/api/v1` |
| `API_GATEWAY_URL` | URL API Gateway | `http://api-gateway:3001` |
| `KWORK_TEST_USERNAME` | Логин Kwork | - |
| `KWORK_TEST_PASSWORD` | Пароль Kwork | - |
| `TENANT_ID_HEADER` | Заголовок для tenant_id | `X-Tenant-ID` |
| `DEFAULT_TENANT_ID` | ID тенанта по умолчанию | `00000000-0000-0000-0000-000000000001` |

### Docker конфигурация

Сервис интегрирован в `docker-compose.messaging.yml`:

```yaml
kwork-service:
  build:
    context: ./kwork-service
    dockerfile: Dockerfile
  environment:
    - HOST=0.0.0.0
    - PORT=8000
    - DEBUG=false
    - SECRET_KEY=dev_jwt_secret_key_unified_for_all_services_32_chars
    # ... другие переменные
  ports:
    - "8004:8000"
  depends_on:
    - postgres
    - redis
    - core-crm
    - api-gateway
  networks:
    - crm-network
  volumes:
    - ./kwork-service/logs:/app/logs
    - ./kwork-service/uploads:/app/uploads
```

## 🔄 Интеграция с CRM

### Автоматическая синхронизация

1. **Заказы Kwork → Лиды CRM**
   - При получении заказов с Kwork автоматически создаются лиды в CRM
   - Сохраняется связь между заказом Kwork и лидом CRM

2. **Пользователи Kwork → Контакты CRM**
   - Информация о пользователях Kwork синхронизируется с контактами CRM
   - Поддерживается мультитенантность

3. **Статусы заказов**
   - Обновления статусов заказов отражаются в CRM
   - Поддерживается отслеживание прогресса

### Ручная синхронизация

```bash
# Синхронизация всех заказов
POST /api/v1/kwork/crm-sync/sync-orders

# Синхронизация контактов
POST /api/v1/kwork/crm-sync/sync-contacts

# Проверка статуса
GET /api/v1/kwork/crm-sync/sync-status
```

## 🏗️ Архитектура

### Компоненты

- **FastAPI** - Веб-фреймворк для API
- **Playwright** - Автоматизация браузера для парсинга Kwork
- **PostgreSQL** - База данных (использует общую БД CRM)
- **Redis** - Кеширование и сессии
- **CRM Integration** - Интеграция с основной CRM системой

### Мультитенантность

Сервис поддерживает мультитенантность через:
- Заголовок `X-Tenant-ID`
- Автоматическое определение tenant_id из токена аутентификации
- Изоляция данных по тенантам

### Безопасность

- Rate limiting (60 запросов в минуту)
- Аутентификация через API Gateway
- Шифрование паролей
- Валидация входных данных

## 🧪 Тестирование

### Тест парсера

```bash
cd multi-saas-crm/kwork-service
python test_kwork_parser.py
```

### Тест API

```bash
cd multi-saas-crm/kwork-service
python test_api.py
```

### Тест интеграции с CRM

```bash
# Проверка создания лидов
curl -X POST "http://localhost:3001/api/v1/kwork/crm-sync/sync-orders" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id"

# Проверка создания контактов
curl -X POST "http://localhost:3001/api/v1/kwork/crm-sync/sync-contacts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id"
```

## 🔍 Мониторинг

### Логи

Логи сохраняются в `kwork-service/logs/`:
- `kwork_service.log` - Основные логи
- `error.log` - Ошибки
- `access.log` - Доступы

### Метрики

- Количество обработанных заказов
- Время ответа API
- Количество созданных лидов
- Ошибки синхронизации

## 🐛 Отладка

### Проблемы с аутентификацией

1. Проверьте правильность логина и пароля Kwork
2. Убедитесь что аккаунт не заблокирован
3. Проверьте не изменилась ли форма входа на Kwork

### Проблемы с парсингом

1. Структура HTML на Kwork могла измениться
2. Добавьте больше отладочной информации в логи
3. Проверьте rate limiting

### Проблемы с интеграцией CRM

1. Проверьте доступность CRM API
2. Убедитесь что API ключ корректный
3. Проверьте tenant_id в заголовках

## 📝 Разработка

### Добавление новых функций

1. Создайте новый endpoint в `app/api/v1/`
2. Добавьте бизнес-логику в `app/services/`
3. Обновите схемы в `app/models/schemas.py`
4. Добавьте тесты

### Обновление парсера

Если Kwork изменил структуру страниц:
1. Изучите новую HTML структуру
2. Обновите селекторы в `app/services/kwork_client.py`
3. Протестируйте изменения

## 🤝 Интеграция с основным проектом

### В docker-compose.messaging.yml

Сервис уже интегрирован в основной docker-compose файл.

### В API Gateway

Маршруты уже настроены в `api-gateway/src/routes/kwork.ts`.

### В Frontend

Для интеграции в frontend добавьте компоненты для работы с Kwork API.

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи в `kwork-service/logs/`
2. Убедитесь что все зависимости установлены
3. Проверьте правильность заполнения `.env` файла
4. Протестируйте отдельные компоненты
5. Проверьте доступность CRM и API Gateway

## 🔗 Полезные ссылки

- **Документация API**: http://localhost:8004/docs
- **API Gateway**: http://localhost:3001
- **CRM API**: http://localhost:8080/api/v1
- **Frontend**: http://localhost:3000 