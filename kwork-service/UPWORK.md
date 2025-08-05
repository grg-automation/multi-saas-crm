# 🚀 UPWORK

### 1. Парсинг Профиля

```bash
 GET https://www.upwork.com/api/profiles/v2/me

{
  "profile": {
    "id": "1234567890abcdef",
    "first_name": "John",
    "last_name": "Doe",
    "company_name": null,
    "location": {
      "country": "United States",
      "timezone": "America/New_York"
    },
    "portrait_url_100": "https://www.upwork.com/photos/profile.jpg",
    "profile_type": "freelancer",
    "skills": [
      "Python", "API Integration", "Django"
    ],
    "is_agency_member": false
  }
}

```



### 1. Вакансии (Jobs)

```bash
 GET https://www.upwork.com/api/jobs/v2/search?q=python&paging=0;10
 
{
  "jobs": [
    {
      "ciphertext": "abcdef123456",
      "title": "Python Developer Needed",
      "snippet": "Looking for a Python developer for data parsing.",
      "category2": "Web Development",
      "subcategory2": "Full Stack",
      "job_type": "hourly",
      "budget": null,
      "client": {
        "country": "United States",
        "feedback": 4.9,
        "reviews_count": 120
      },
      "date_created": "2025-07-30T14:12:00Z"
    }
  ],
  "paging": { "count": 100, "offset": 0, "limit": 10 }
}

```


### 1. Детали вакансии


```bash
GET https://www.upwork.com/api/jobs/v2/job/{job_key}

{
  "job": {
    "ciphertext": "abcdef123456",
    "title": "Python Developer Needed",
    "description": "We need a skilled Python developer for web scraping.",
    "skills": ["Python", "Scrapy", "API Integration"],
    "budget": 500,
    "job_type": "fixed-price",
    "client": {
      "country": "United States",
      "payment_verified": true,
      "total_spent": 20000,
      "feedback": 4.8
    }
  }
}


```

### 1. Контракты

```bash
GET https://www.upwork.com/api/contracts/v2/

{
  "contracts": [
    {
      "id": "987654321",
      "title": "Full Stack Developer",
      "status": "active",
      "hourly_rate": 35,
      "start_date": "2025-06-15",
      "end_date": null,
      "client_name": "Alice Johnson"
    }
  ]
}

```

### 1.Чаты и сообщения

Список чатов

```bash
GET https://www.upwork.com/api/hrs/v2/threads


{
  "threads": [
    {
      "id": "123abc456def",
      "topic": "Python Project",
      "unread_messages_count": 2,
      "participants": [
        { "id": "111", "name": "ClientName" },
        { "id": "222", "name": "John Doe" }
      ]
    }
  ]
}

```

Сообщения в чате

```bash
GET https://www.upwork.com/api/hrs/v2/threads/{thread_id}

{
  "messages": [
    { "id": "1", "sender": "ClientName", "text": "Hello!" },
    { "id": "2", "sender": "John Doe", "text": "Hi, how can I help?" }
  ]
}


```


Отправка сообщения

```bash
POST https://www.upwork.com/api/hrs/v2/threads/{thread_id}/messages

{
  "message": "I am interested in your project!"
}


```


### 1. Предложения (Proposals)

```bash
GET https://www.upwork.com/api/proposals/v2/{job_key}/proposals

{
  "proposals": [
    {
      "id": "abc123",
      "freelancer_name": "John Doe",
      "rate": 25,
      "submitted_at": "2025-07-30T10:15:00Z",
      "status": "active"
    }
  ]
}

```


### 1. Отчёты и платежи

Доходы

```bash
GET https://www.upwork.com/api/reports/v2/earnings

{
  "earnings": [
    { "week": "2025-W30", "amount": 350, "currency": "USD" }
  ]
}

```


История транзакций


```bash
GET https://www.upwork.com/api/payments/v2/

{
  "payments": [
    {
      "id": "p789",
      "amount": 150,
      "currency": "USD",
      "date": "2025-07-28",
      "description": "Hourly payment"
    }
  ]
}

```
