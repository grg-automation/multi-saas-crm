# Multi-SaaS CRM Platform

Многотенантная CRM платформа на основе микросервисной архитектуры с поддержкой мультиканальных уведомлений, AI интеграции и Telegram API.

## 🚀 Быстрый старт

### Запуск всей системы
```bash
npm run setup              # Установка зависимостей и запуск среды разработки
npm run start:dev          # Запуск среды разработки с Docker Compose
npm run start:minimal      # Запуск минимальной версии CRM
npm run start:production   # Запуск production среды
```

### Основные сервисы
- **Frontend**: http://localhost:3000 - React UI с Tailwind CSS
- **Core CRM**: http://localhost:8080 - Основной Kotlin backend  
- **API Gateway**: http://localhost:3001 - Маршрутизация запросов
- **Identity Service**: http://localhost:3002 - Аутентификация и SSO
- **Notification Service**: http://localhost:3003 - Уведомления и Telegram API

### Готовые учетные записи
- **Администратор**: admin@test.com / test123
- **Менеджер 1**: manager@test.com / test123  
- **Менеджер 2**: manager2@test.com / test123
- **Менеджер 3 (зарегистрированный)**: testcontacts@example.com / TestPassword123!

## 🏗️ Архитектура системы

### Основные компоненты
- **Frontend** (Next.js 14) - Пользовательский интерфейс
- **Core CRM** (Kotlin + Spring Boot 3) - Основной бекенд
- **Identity Service** (NestJS) - Управление пользователями и аутентификация
- **Notification Service** (NestJS) - Мультиканальные уведомления
- **AI Service** (Python FastAPI) - OpenAI интеграция и машинное обучение
- **API Gateway** (Node.js) - Маршрутизация и аутентификация запросов

### Инфраструктура
- **PostgreSQL** (порт 5432) - Основная база данных с Row Level Security
- **Redis** (порт 6379) - Кеширование и сессии
- **ClickHouse** - Аналитика и метрики
- **Elasticsearch** (порт 9200) - Поиск

## 📱 Telegram интеграция

### ⚠️ Предварительная настройка

**Для работы с Telegram API необходимо получить собственные ключи:**

1. **Получить API ключи Telegram:**
   - Перейдите на https://my.telegram.org/apps
   - Войдите в свой аккаунт Telegram
   - Создайте новое приложение
   - Скопируйте `api_id` и `api_hash`

2. **Настроить в docker-compose.messaging.yml:**
   ```yaml
   notification-service:
     environment:
       - TELEGRAM_API_ID=your_api_id_here
       - TELEGRAM_API_HASH=your_api_hash_here
   ```

3. **Или создать .env файл в notification-service/:**
   ```bash
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_messaging_dev
   ```

**⚠️ Важно**: Без этих ключей Telegram интеграция работать не будет!

### Особенности
- **MTProto API**: Полная реализация через GramJS для прямых сообщений (не Bot API)
- **WebSocket**: Режим реального времени для обновлений сообщений
- **Файлы до 2GB**: Поддержка загрузки больших файлов с правильными именами
- **Управление сессиями**: Хранение в PostgreSQL с авторизацией по номеру телефона
- **Real-time уведомления**: Webhook система для мгновенных обновлений

### API Endpoints для работы с Telegram

**Base URL**: `http://localhost:3003/api/v1/telegram-user-v2`

#### 🔐 Управление сессиями

**Получить все сессии**
```bash
GET /sessions
curl -X GET "http://localhost:3003/api/v1/telegram-user-v2/sessions"
```
*Возвращает список всех Telegram сессий с их статусами*

**Создать новую сессию**
```bash
POST /create-session
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/create-session" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'
```
*Создает новую сессию для указанного номера телефона*

**Проверить статус сессии**
```bash
GET /{sessionId}/status
curl -X GET "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/status"
```
*Показывает состояние конкретной сессии (подключена, авторизована)*

#### 📨 Отправка сообщений

**Отправить текстовое сообщение**
```bash
POST /{sessionId}/send-message/{chatId}
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/send-message/{chatId}" \
  -H "Content-Type: application/json" \
  -d '{"message": "Привет! Это тестовое сообщение"}'
```
*Отправляет текстовое сообщение в указанный чат*

**Отправить файл (до 2GB)**
```bash
POST /{sessionId}/send-file/{chatId}
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/send-file/{chatId}" \
  -F "file=@/path/to/your/file.pdf" \
  -F "caption=Описание файла (опционально)"
```
*Отправляет файл с сохранением оригинального имени и поддержкой больших размеров*

#### 💬 Получение чатов и сообщений

**Получить список чатов**
```bash
GET /{sessionId}/chats
curl -X GET "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/chats"
```
*Возвращает список всех доступных чатов (диалоги, группы, каналы)*

**Получить историю чата**
```bash
GET /{sessionId}/chat/{chatId}/history?limit=50&offset=0
curl -X GET "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/chat/{chatId}/history?limit=50&offset=0"
```
*Получает историю сообщений для конкретного чата с пагинацией*

**Получить информацию о чате**
```bash
GET /{sessionId}/chat/{chatId}/info
curl -X GET "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/chat/{chatId}/info"
```
*Возвращает детальную информацию о чате (название, участники, тип)*

#### 🔔 Webhook и real-time обновления

**Настроить webhook**
```bash
POST /{sessionId}/setup-webhook
# Для локальной разработки:
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/setup-webhook" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"http://localhost:3003/api/v1/telegram-user-v2/webhook"}'

# Для внешнего доступа через туннель:
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/setup-webhook" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://your-tunnel-domain.ngrok-free.app/api/v1/telegram-user-v2/webhook"}'
```
*Настраивает webhook для получения real-time обновлений новых сообщений*

**Webhook endpoint (автоматический)**
```bash
POST /webhook
# Этот endpoint автоматически принимает обновления от Telegram
# Не требует ручного вызова
```
*Автоматически принимает и обрабатывает входящие сообщения от Telegram*

#### 📋 Управление чатами для менеджеров

**Получить назначенные чаты менеджера**
```bash
GET /manager/{managerId}/threads
curl -X GET "http://localhost:3003/api/v1/telegram-user-v2/manager/{managerId}/threads"
```
*Возвращает список чатов, назначенных конкретному менеджеру*

**Назначить чат менеджеру (только админ)**
```bash
POST /manager/assign-chat
curl -X POST "http://localhost:3003/api/v1/manager/assign-chat" \
  -H "Content-Type: application/json" \
  -d '{"threadId": "telegram_thread_123456", "managerId": "uuid-manager-id"}'
```
*Назначает конкретный чат менеджеру (используется в админ-панели)*

### Практические примеры использования

#### Полный workflow создания сессии
```bash
# 1. Создать сессию
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/create-session" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# 2. Получить sessionId из ответа, затем проверить статус
curl -X GET "http://localhost:3003/api/v1/telegram-user-v2/tg_user_123/status"

# 3. Настроить webhook для real-time обновлений
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/tg_user_123/setup-webhook" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"http://localhost:3003/api/v1/telegram-user-v2/webhook"}'

# 4. Получить список чатов
curl -X GET "http://localhost:3003/api/v1/telegram-user-v2/tg_user_123/chats"

# 5. Отправить сообщение в чат
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/tg_user_123/send-message/123456789" \
  -H "Content-Type: application/json" \
  -d '{"message": "Добро пожаловать в нашу CRM систему!"}'
```

#### Отправка файла с описанием
```bash
curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/tg_user_123/send-file/123456789" \
  -F "file=@/path/to/contract.pdf" \
  -F "caption=Договор на оказание услуг - пожалуйста, ознакомьтесь и подпишите"
```

### Получение активной сессии для webhook
```bash
# Получить ID активной сессии
docker-compose -f docker-compose.messaging.yml exec postgres psql -U crm_user -d crm_messaging_dev -c "SELECT \"sessionId\" FROM telegram_sessions WHERE \"isAuthenticated\" = true AND \"isConnected\" = true;"
```

### WebSocket подключения для real-time
Система также поддерживает WebSocket подключения для мгновенных обновлений:
- **WebSocket URL**: `ws://localhost:3003/messaging`
- **События**: Новые сообщения, изменения статусов, обновления чатов
- **Аутентификация**: JWT токен в query параметрах или headers

## 👥 Управление пользователями

### Назначение ролей
```bash
# Назначить роль MANAGER
docker-compose -f docker-compose.messaging.yml exec postgres psql -U crm_user -d crm_messaging_dev -c "UPDATE users SET role = 'MANAGER' WHERE email = 'user@example.com';"

# Назначить роль ADMIN
docker-compose -f docker-compose.messaging.yml exec postgres psql -U crm_user -d crm_messaging_dev -c "UPDATE users SET role = 'ADMIN' WHERE email = 'user@example.com';"

# Проверить роли пользователей
docker-compose -f docker-compose.messaging.yml exec postgres psql -U crm_user -d crm_messaging_dev -c "SELECT id, email, role, is_active, is_verified FROM users ORDER BY email;"
```

### Исправление проблем регистрации
```bash
# Исправить поля created_at и is_verified
docker-compose -f docker-compose.messaging.yml exec postgres psql -U crm_user -d crm_messaging_dev -c "UPDATE users SET created_at = NOW(), is_verified = true WHERE email = 'user@example.com';"
```

## 🔧 Разработка

### Запуск отдельных сервисов

**Kotlin Core Service**
```bash
cd core
./gradlew bootRun  # Запуск (порт 8080)
./gradlew build    # Сборка
./gradlew test     # Тесты
```

**NestJS сервисы**
```bash
# Identity Service (порт 3002)
cd identity-service && npm run start:dev

# Notification Service (порт 3003)  
cd notification-service && npm run start:dev
```

**AI Service**
```bash
cd ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8003
```

### Сборка и тестирование
```bash
npm run build         # Сборка frontend
npm run test          # Тесты Python backend
npm run test:frontend # Тесты frontend
npm run lint          # Линтинг frontend
npm run typecheck     # Проверка типов TypeScript
```

### Управление Docker
```bash
# Текущая основная конфигурация
docker-compose -f docker-compose.messaging.yml up -d

# Остановка и очистка
npm run stop          # Остановить все сервисы
npm run clean         # Очистить Docker систему
npm run logs          # Просмотр логов

# Отдельные сервисы
docker-compose -f docker-compose.messaging.yml restart notification-service
docker-compose -f docker-compose.messaging.yml logs notification-service --tail=20
```

## 🧪 Тестирование

### Интеграционные тесты
```bash
node test-full-integration-v2.js  # Полный интеграционный тест
node test-crm-integration.js      # Функциональность CRM
node test-custom-fields.js        # Пользовательские поля
node test-routing.js              # Маршрутизация API Gateway
node test-services.js             # Проверка здоровья сервисов
```

### Тесты по сервисам
```bash
cd core && ./gradlew test                    # Kotlin Core
cd identity-service && npm test             # Identity Service
cd notification-service && npm test         # Notification Service
cd ai-service && python -m pytest          # AI Service
cd backend && python -m pytest             # Legacy Backend
```

## 🛠️ Частые задачи разработки

### Добавление новых возможностей в Core CRM (Kotlin)
1. Создать entities в `/core/src/main/kotlin/com/backend/core/[domain]/`
2. Добавить repositories, расширяющие `JpaRepository`
3. Реализовать сервисы с бизнес-логикой
4. Создать REST контроллеры с правильной безопасностью

### Работа с NestJS сервисами
1. Использовать NestJS CLI: `nest generate module/service/controller [name]`
2. Следовать существующим паттернам в identity/notification сервисах
3. Добавлять валидацию с class-validator
4. Включать tenant context во все операции

### Разработка AI сервиса
1. Добавлять новые endpoints в `/ai-service/app/api/v1/`
2. Реализовывать кеширование в сервисах через Redis
3. Тестировать с dedicated cache endpoints
4. Использовать абстракции OpenAI сервиса

## 🔍 Отладка и устранение неполадок

### Распространенные проблемы

**Проблемы с загрузкой файлов в Telegram**
- **Проблема**: Файлы отображаются как "unnamed" в Telegram
- **Решение**: Использовать `Api.DocumentAttributeFilename({ fileName: originalname })`
- **Расположение кода**: `notification-service/src/telegram-user/telegram-service-v2.ts`

**Таймауты больших файлов**
- **Проблема**: Файлы >100MB вызывают HTTP таймауты в frontend
- **Причина**: Загрузка GramJS может занимать 5-15 минут
- **Решение**: Файлы успешно загружаются даже при таймауте frontend

**Проблемы с Docker контейнерами**
- **Пересборка**: После изменений в TypeScript сервисах использовать `--build` флаг
- **Мониторинг логов**: `docker-compose -f docker-compose.messaging.yml logs [service] --tail=N --follow`
- **Перезапуск сервиса**: `docker-compose -f docker-compose.messaging.yml restart [service]`

### Workflow для Notification Service
1. Внести изменения в `/notification-service/src/`
2. Перезапустить сервис: `docker-compose -f docker-compose.messaging.yml restart notification-service`
3. Подождать 5 секунд для запуска
4. Восстановить webhooks: `curl -X POST "http://localhost:3003/api/v1/telegram-user-v2/{sessionId}/setup-webhook"`
5. Тестировать функциональность и мониторить логи

## 🔐 Мультитенантность

Система использует комплексную мультитенантную архитектуру:
- Изоляция на уровне базы данных через Row Level Security
- Контекст tenant распространяется через все сервисы  
- JWT токены содержат информацию о tenant
- Каждый API запрос включает валидацию tenant

## 🤖 AI/ML возможности

- **Скоринг лидов**: Алгоритмы на основе OpenAI
- **Анализ тональности**: Анализ коммуникаций в реальном времени
- **RAG система**: База знаний с векторным поиском
- **Кеширование**: Кеширование ответов AI на основе Redis
- **Тестирование**: Специальные endpoints для тестирования кеша

## 📊 Аналитика и мониторинг

- **ClickHouse**: Высокопроизводительное хранение аналитики
- **Superset**: Интерактивные дашборды и визуализация
- **ML модели**: Интегрированное прогнозирование и обнаружение аномалий
- **Grafana**: Мониторинг системы и метрики