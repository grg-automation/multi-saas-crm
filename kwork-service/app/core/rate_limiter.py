import asyncio
import time
from typing import Dict, Optional
from collections import defaultdict, deque
import logging

logger = logging.getLogger(__name__)

class RateLimiter:
    """
    Реализация rate limiting с помощью token bucket алгоритма
    для защиты от превышения лимитов запросов к Kwork
    """
    
    def __init__(self, max_requests: int = 60, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.buckets: Dict[str, deque] = defaultdict(deque)
        self.locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        
    async def allow_request(self, identifier: str) -> bool:
        """
        Проверяет, можно ли выполнить запрос для данного идентификатора
        
        Args:
            identifier: Уникальный идентификатор (IP, user_id, account_id)
            
        Returns:
            bool: True если запрос разрешен, False если превышен лимит
        """
        async with self.locks[identifier]:
            current_time = time.time()
            bucket = self.buckets[identifier]
            
            # Удаляем старые записи
            while bucket and bucket[0] <= current_time - self.time_window:
                bucket.popleft()
            
            # Проверяем лимит
            if len(bucket) >= self.max_requests:
                logger.warning(f"Rate limit exceeded for {identifier}")
                return False
            
            # Добавляем новую запись
            bucket.append(current_time)
            return True
    
    async def get_remaining_requests(self, identifier: str) -> int:
        """
        Возвращает количество оставшихся запросов в текущем окне
        """
        async with self.locks[identifier]:
            current_time = time.time()
            bucket = self.buckets[identifier]
            
            # Удаляем старые записи
            while bucket and bucket[0] <= current_time - self.time_window:
                bucket.popleft()
            
            return max(0, self.max_requests - len(bucket))
    
    async def reset_bucket(self, identifier: str):
        """
        Сбрасывает bucket для данного идентификатора
        """
        async with self.locks[identifier]:
            self.buckets[identifier].clear()
    
    def cleanup_old_buckets(self, max_age: int = 3600):
        """
        Очищает старые bucket для освобождения памяти
        """
        current_time = time.time()
        to_remove = []
        
        for identifier, bucket in self.buckets.items():
            if bucket and bucket[-1] <= current_time - max_age:
                to_remove.append(identifier)
        
        for identifier in to_remove:
            del self.buckets[identifier]
            if identifier in self.locks:
                del self.locks[identifier]

class AccountRateLimiter:
    """
    Специализированный rate limiter для аккаунтов Kwork
    с поддержкой различных типов операций
    """
    
    def __init__(self):
        # Основной лимит: 60 запросов в минуту
        self.general_limiter = RateLimiter(max_requests=60, time_window=60)
        
        # Лимит для сообщений: 10 сообщений в минуту
        self.message_limiter = RateLimiter(max_requests=10, time_window=60)
        
        # Лимит для откликов: 5 откликов в минуту
        self.response_limiter = RateLimiter(max_requests=5, time_window=60)
        
        # Лимит для редактирования кворков: 2 операции в минуту
        self.gig_edit_limiter = RateLimiter(max_requests=2, time_window=60)
        
        # Лимит для авторизации: 1 попытка в 24 часа
        # Увеличим лимит до 10 попыток в час
        self.auth_limiter = RateLimiter(max_requests=10, time_window=3600)

    async def allow_general_request(self, account_id: str) -> bool:
        """Общий лимит для всех запросов"""
        return await self.general_limiter.allow_request(account_id)
    
    async def allow_message(self, account_id: str) -> bool:
        """Лимит для отправки сообщений"""
        return await self.message_limiter.allow_request(account_id)
    
    async def allow_response(self, account_id: str) -> bool:
        """Лимит для откликов на заказы"""
        return await self.response_limiter.allow_request(account_id)
    
    async def allow_gig_edit(self, account_id: str) -> bool:
        """Лимит для редактирования кворков"""
        return await self.gig_edit_limiter.allow_request(account_id)
    
    async def allow_auth(self, account_id: str) -> bool:
        """Лимит для авторизации"""
        return await self.auth_limiter.allow_request(account_id)
    
    async def get_rate_limit_info(self, account_id: str) -> dict:
        """
        Возвращает информацию о текущих лимитах для аккаунта
        """
        return {
            "general": await self.general_limiter.get_remaining_requests(account_id),
            "messages": await self.message_limiter.get_remaining_requests(account_id),
            "responses": await self.response_limiter.get_remaining_requests(account_id),
            "gig_edits": await self.gig_edit_limiter.get_remaining_requests(account_id),
            "auth": await self.auth_limiter.get_remaining_requests(account_id)
        }

# Глобальный экземпляр rate limiter для аккаунтов
account_rate_limiter = AccountRateLimiter()