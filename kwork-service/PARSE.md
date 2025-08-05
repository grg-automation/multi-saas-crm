# Kwork Parser API

## 🚀 Start

### Для начала нужно добавить аккаунт KWORK

```
POST : api/v1/accounts
{
  "login": "string",
  "password": "string",
  "account_name": "string"
}
```

### 1. Парсинг Kworks

```
GET : api/v1/quark/parse-kworks/{account_id}/with-details
```
Сохраняет в uploads/kworks/

![img.png](img.png)


### 2. Парсинг Chats

```
GET : api/v1/chat/parse-chats/{account_id}/with-messages
```
Сохраняет в uploads/chats/

![img_1.png](img_1.png)

### 3. Парсинг Profile

Парсинг:

```
POST : api/v1/accounts/2/test-connection
```
Получение Данных :

```
POST : api/v1/accounts/{account_id}/info
```
![img_2.png](img_2.png)


### 4. Парсинг Orders

Парсинг:

```
GET : api/v1/orders/parse/{account_id}
```
Получение Данных :

```
GET : api/v1/orders/orders/{account_id}/
```

![img_3.png](img_3.png)


### 5. Парсинг Биржа
Сначала нужно
```
POST : api/v1/accounts/{account_id}/switch
{
  "account_id": "string"
}
```


Парсинг:

```
GET : api/v1/projects/parse/raw
```
Получение Данных :

```
GET : api/v1/projects
```
![img_4.png](img_4.png)

