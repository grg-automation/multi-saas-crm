# Kwork Service

Микросервис для интеграции с платформой Kwork.ru в рамках многотенантной CRM системы.

## 🚀 Быстрый старт

### Локальный запуск

```bash
# Установка зависимостей
pip install -r requirements.txt

# Настройка переменных окружения
cp env.template .env
# Отредактируйте .env файл

# Запуск сервиса
python main.py
```

### Docker запуск

```bash
# Сборка и запуск
docker-compose up --build

# Или только kwork-service
docker-compose up kwork-service
```

## 🔧 Конфигурация

### Переменные окружения (.env)

```env
# Основные настройки
HOST=0.0.0.0
PORT=8000
DEBUG=false

# Безопасность
SECRET_KEY=your-secret-key-change-in-production
CRM_API_KEY=your-crm-api-key

# База данных
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=kwork_user
POSTGRES_PASSWORD=kwork_password
POSTGRES_DB=kwork_service

# Redis
REDIS_URL=redis://localhost:6379

# Интеграция с CRM
CRM_API_URL=http://localhost:8080
API_GATEWAY_URL=http://localhost:3001

# Kwork учетные данные
KWORK_TEST_USERNAME=your_kwork_username
KWORK_TEST_PASSWORD=your_kwork_password

# Мультитенантность
TENANT_ID_HEADER=X-Tenant-ID
DEFAULT_TENANT_ID=default
```

## 📡 API Endpoints

### Основные endpoints

- **Документация**: http://localhost:8004/docs
- **Health check**: http://localhost:8004/health

### Аутентификация
- `POST /api/v1/auth/login` - Вход в систему
- `POST /api/v1/auth/logout` - Выход из системы

### Аккаунты Kwork
- `GET /api/v1/accounts` - Список аккаунтов
- `POST /api/v1/accounts` - Добавить аккаунт
- `PUT /api/v1/accounts/{id}` - Обновить аккаунт
- `DELETE /api/v1/accounts/{id}` - Удалить аккаунт

### Заказы
- `GET /api/v1/orders` - Получить заказы
- `POST /api/v1/orders/{id}/respond` - Откликнуться на заказ
- `PATCH /api/v1/orders/{id}/stage` - Обновить этап заказа
- `POST /api/v1/orders/{id}/deliver` - Сдать заказ

### Кворки
- `GET /api/v1/gigs` - Получить кворки
- `PUT /api/v1/gigs/{id}` - Обновить кворк

### Чат
- `GET /api/v1/chat/{dialog_id}/messages` - Сообщения чата
- `POST /api/v1/chat/{dialog_id}/send` - Отправить сообщение

### Интеграция с CRM
- `POST /api/v1/crm-sync/sync-orders` - Синхронизация заказов с CRM
- `POST /api/v1/crm-sync/sync-contacts` - Синхронизация контактов с CRM
- `GET /api/v1/crm-sync/sync-status` - Статус синхронизации

## 🔗 Интеграция с основной CRM

### Создание лидов из заказов Kwork

```bash
# Синхронизация заказов с созданием лидов
curl -X POST "http://localhost:8004/api/v1/crm-sync/sync-orders" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id" \
  -H "Content-Type: application/json" \
  -d '{
    "page": 1,
    "limit": 50,
    "category": "web-development",
    "min_price": 1000
  }'
```

### Создание контактов из пользователей Kwork

```bash
# Синхронизация контактов
curl -X POST "http://localhost:8004/api/v1/crm-sync/sync-contacts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id"
```

### Получение заказов с автоматическим созданием лидов

```bash
# Получение заказов с созданием лидов в CRM
curl -X GET "http://localhost:8004/api/v1/orders?create_leads=true" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: your_tenant_id"
```

## 🏗️ Архитектура

### Компоненты

- **FastAPI** - Веб-фреймворк
- **Playwright** - Автоматизация браузера для парсинга Kwork
- **PostgreSQL** - База данных
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

## 🔄 Синхронизация с CRM

### Автоматическая синхронизация

1. **Заказы → Лиды**: Заказы с Kwork автоматически создают лиды в CRM
2. **Пользователи → Контакты**: Информация о пользователях Kwork синхронизируется с контактами CRM
3. **Статусы**: Обновления статусов заказов отражаются в CRM

### Ручная синхронизация

```bash
# Синхронизация всех заказов
POST /api/v1/crm-sync/sync-orders

# Синхронизация контактов
POST /api/v1/crm-sync/sync-contacts

# Проверка статуса
GET /api/v1/crm-sync/sync-status
```

## 🐳 Docker

### Сборка образа

```bash
docker build -t kwork-service .
```

### Запуск с docker-compose

```bash
# Полный стек
docker-compose up --build

# Только kwork-service
docker-compose up kwork-service
```

### Переменные окружения для Docker

```yaml
environment:
  - CRM_API_URL=http://crm-service:8080
  - API_GATEWAY_URL=http://api-gateway:3001
  - POSTGRES_HOST=postgres
  - REDIS_URL=redis://redis:6379
```

## 📊 Мониторинг

### Логи

Логи сохраняются в `logs/` директории:
- `kwork_service.log` - Основные логи
- `error.log` - Ошибки
- `access.log` - Доступы

### Метрики

- Количество обработанных заказов
- Время ответа API
- Количество созданных лидов
- Ошибки синхронизации

## 🧪 Тестирование

```bash
# Тест парсера
python test_kwork_parser.py

# Тест API
python test_api.py

# Тест интеграции с CRM
python -m pytest tests/test_crm_integration.py
```

## 🔧 Разработка

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

```yaml
kwork-service:
  build: ./kwork-service
  ports:
    - "8004:8000"
  environment:
    - CRM_API_URL=http://backend:8080
    - API_GATEWAY_URL=http://api-gateway:3001
  depends_on:
    - backend
    - api-gateway
    - postgres
    - redis
```

### В API Gateway

Добавьте маршрут в `api-gateway/src/routes/`:

```typescript
// kwork.ts
export const kworkRoutes = {
  '/api/v1/kwork/*': 'http://kwork-service:8000/api/v1/*'
};
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи в `logs/`
2. Убедитесь что все зависимости установлены
3. Проверьте правильность заполнения `.env` файла
4. Протестируйте отдельные компоненты
5. Проверьте доступность CRM и API Gateway