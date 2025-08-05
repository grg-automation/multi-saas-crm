import httpx
import asyncio
import random
import json
import logging
from ..models.schemas import ParsedOrder,AccountInfo
from typing import Dict, Any, Optional, List,Union
from datetime import datetime, timedelta
from fake_useragent import UserAgent
from urllib.parse import urljoin, urlparse
import time
import re
from playwright.async_api import async_playwright
import os

from bs4 import BeautifulSoup
from ..core.database import Database
from chromedriver_autoinstaller import install
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from ..core.config import settings
from ..core.rate_limiter import account_rate_limiter
from ..core.security import decrypt_password
from .kwork_playwright_auth import authenticate_kwork_account
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
logger = logging.getLogger(__name__)

class KworkClient:
    """
    Клиент для работы с Kwork без официального API
    Реализует безопасные запросы с соблюдением всех ограничений
    """
    
    def __init__(self, account_id: str, login: str, encrypted_password: str):
        self.account_id = account_id
        self.login = login
        self.encrypted_password = encrypted_password
        self.session_data = {}
        self.last_request_time = 0
        self.ua = UserAgent()
        
        # Настройка HTTP клиента
        self.client = httpx.AsyncClient(
            base_url=settings.KWORK_BASE_URL,
            timeout=30.0,
            follow_redirects=True,  # Автоматически следуем редиректам
            headers={
                "User-Agent": self.ua.random,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Upgrade-Insecure-Requests": "1",
            }
        )
        
        self.is_authenticated = False
        self.session_cookies = {}
        self.csrf_token = None
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def close(self):
        """Закрытие HTTP клиента"""
        await self.client.aclose()

    async def _ensure_rate_limit(self):
        """Обеспечение соблюдения rate limit"""
        if not await account_rate_limiter.allow_general_request(self.account_id):
            raise Exception("Rate limit exceeded for account")
        
        # Естественная задержка между запросами
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < settings.MIN_DELAY:
            delay = random.uniform(settings.MIN_DELAY, settings.MAX_DELAY)
            await asyncio.sleep(delay)
        
        self.last_request_time = time.time()
    
    async def _make_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Выполнение HTTP запроса с проверками безопасности"""
        await self._ensure_rate_limit()
        
        # Добавление CSRF токена если есть
        if self.csrf_token and method.upper() in ["POST", "PUT", "PATCH", "DELETE"]:
            if "headers" not in kwargs:
                kwargs["headers"] = {}
            kwargs["headers"]["X-CSRF-Token"] = self.csrf_token
        
        # Добавление cookies
        if self.session_cookies:
            if "cookies" not in kwargs:
                kwargs["cookies"] = {}
            kwargs["cookies"].update(self.session_cookies)
        
        try:
            response = await self.client.request(method, url, **kwargs)
            
            # Обновление cookies
            if response.cookies:
                self.session_cookies.update(response.cookies)
            
            # Логирование запроса
            logger.info(f"Kwork request: {method} {url} - {response.status_code}")
            
            return response
            
        except httpx.RequestError as e:
            logger.error(f"Request error: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            raise
    
    async def authenticate(self) -> bool:
        """
        Аутентификация в Kwork
        Максимум 1 раз в сутки согласно антиблокировочной политике
        """
        if not await account_rate_limiter.allow_auth(self.account_id):
            logger.warning(f"Auth rate limit exceeded for account {self.account_id}")
            return False
        
        try:
            # Получение страницы логина
            login_page = await self._make_request("GET", "/login")
            
            if login_page.status_code != 200:
                logger.error(f"Failed to get login page: {login_page.status_code}")
                return False
            
            # Парсинг HTML страницы для извлечения CSRF токена
            soup = BeautifulSoup(login_page.text, 'html.parser')
            
            # Поиск CSRF токена в hidden input или meta tag
            csrf_token = None
            
            # Поиск в meta тегах
            csrf_meta = soup.find('meta', {'name': 'csrf-token'})
            if csrf_meta:
                csrf_token = csrf_meta.get('content')
            
            # Поиск в hidden input
            if not csrf_token:
                csrf_input = soup.find('input', {'name': '_token'}) or soup.find('input', {'name': 'csrf_token'})
                if csrf_input:
                    csrf_token = csrf_input.get('value')
            
            # Поиск формы логина для определения action URL
            login_form = soup.find('form', {'id': 'login-form'}) or soup.find('form', class_=re.compile(r'login'))
            form_action = "/login"
            if login_form:
                action = login_form.get('action', '/login')
                if action:
                    form_action = action
            
            logger.info(f"Found login form action: {form_action}")
            if csrf_token:
                logger.info(f"Found CSRF token: {csrf_token[:10]}...")
                self.csrf_token = csrf_token
            
            # Имитация задержки перед вводом данных
            await asyncio.sleep(random.uniform(2, 4))
            
            # Попытка аутентификации
            password = decrypt_password(self.encrypted_password)
            
            # Подготовка данных формы (на основе скриншота формы логина)
            auth_data = {
                "login": self.login,      # Поле логина
                "password": password,     # Поле пароля
                "remember": "1"           # Чекбокс "Запомнить меня"
            }
            
            # Добавление CSRF токена если найден
            if csrf_token:
                auth_data["_token"] = csrf_token
            
            # Отправка формы как form-data, а не JSON
            auth_response = await self._make_request(
                "POST", 
                form_action,
                data=auth_data,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": urljoin(settings.KWORK_BASE_URL, "/login")
                }
            )
            
            # Проверка успешной аутентификации
            if auth_response.status_code in [200, 302]:  # 302 может быть редирект после успешного логина
                
                # Проверяем, есть ли редирект на главную страницу
                if auth_response.status_code == 302:
                    location = auth_response.headers.get("location", "")
                    if "/login" in location:
                        # Редирект обратно на логин = ошибка аутентификации
                        logger.error("Authentication failed: redirected back to login")
                        return False
                    else:
                        self.is_authenticated = True
                        logger.info(f"Successfully authenticated account {self.account_id} (redirect to {location})")
                        return True
                
                # Для 200 проверяем содержимое страницы
                response_text = auth_response.text
                
                # Поиск индикаторов успешной авторизации
                if any(indicator in response_text.lower() for indicator in [
                    "logout", "выйти", "profile", "профиль", "dashboard", "personal"
                ]):
                    self.is_authenticated = True
                    logger.info(f"Successfully authenticated account {self.account_id}")
                    return True
                elif any(error in response_text.lower() for error in [
                    "error", "ошибка", "неверный", "invalid", "incorrect"
                ]):
                    logger.error("Authentication failed: login error detected in response")
                    return False
                else:
                    # Попробуем проверить, получив профиль
                    profile_check = await self._make_request("GET", "/profile")
                    if profile_check.status_code == 200:
                        self.is_authenticated = True
                        logger.info(f"Successfully authenticated account {self.account_id} (verified via profile)")
                        return True
                    else:
                        logger.error("Authentication failed: unable to verify via profile check")
                        return False
            else:
                logger.error(f"Authentication request failed: {auth_response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False
    
    async def authenticate_with_playwright(self, show_browser: bool = False, force_new_auth: bool = False) -> bool:
        """
        Аутентификация через Playwright с визуальным браузером
        """
        if not await account_rate_limiter.allow_auth(self.account_id):
            logger.warning(f"Auth rate limit exceeded for account {self.account_id}")
            return False
        
        try:
            logger.info(f"Запуск Playwright аутентификации для {self.login}")
            
            # Расшифровываем пароль
            password = decrypt_password(self.encrypted_password)
            
            # Выполняем аутентификацию через Playwright
            cookies = await authenticate_kwork_account(
                login=self.login,
                password=password,
                show_browser=show_browser,
                force_new_auth=force_new_auth
            )
            
            if cookies:
                # Сохраняем куки для использования в httpx
                self.session_cookies.update(cookies)
                self.is_authenticated = True
                
                logger.info(f"✅ Playwright аутентификация успешна для {self.login}")
                logger.info(f"Получено {len(cookies)} куки")
                
                return True
            else:
                logger.error(f"❌ Playwright аутентификация не удалась для {self.login}")
                return False
                
        except Exception as e:
            logger.error(f"Ошибка Playwright аутентификации: {e}")
            return False
    
    async def get_orders(self, page: int = 1, limit: int = 20, filters: Dict = None) -> Dict[str, Any]:
        """Получение списка заказов путем парсинга HTML страницы"""
        if not self.is_authenticated:
            return {
                "success": False,
                "error": "Not authenticated",
                "data": []
            }
        
        try:
            # Формируем URL для страницы проектов (биржа проектов)
            url = "/"  # Главная страница с проектами
            params = {"page": page}
            
            # Добавляем фильтры если есть
            if filters:
                # Возможные фильтры: category, min_price, max_price, sort
                if "category" in filters:
                    params["c"] = filters["category"]
                if "min_price" in filters:
                    params["price_from"] = filters["min_price"]
                if "max_price" in filters:
                    params["price_to"] = filters["max_price"]
                if "sort" in filters:
                    params["sort"] = filters["sort"]
            
            response = await self._make_request("GET", url, params=params)
            
            # Обрабатываем различные статусы ответа
            if response.status_code == 200:
                # Парсинг HTML страницы
                soup = BeautifulSoup(response.text, 'html.parser')
            elif response.status_code == 302:
                # Редирект обработан автоматически, проверяем финальный URL
                final_url = str(response.url)
                logger.info(f"Redirected to: {final_url}")
                if "/login" in final_url:
                    return {
                        "success": False,
                        "error": "Authentication expired, redirected to login",
                        "data": []
                    }
                # Парсинг страницы после редиректа
                soup = BeautifulSoup(response.text, 'html.parser')
            else:
                return {
                    "success": False,
                    "error": f"Failed to get orders page: {response.status_code}",
                    "data": []
                }
            
            orders = []
            
            # Поиск контейнеров с заказами на главной странице Kwork
            # Ищем карточки проектов по различным селекторам
            order_cards = (
                soup.find_all('div', class_=re.compile(r'project-item|kwork-item|service-card|offer-card')) or
                soup.find_all('article', class_=re.compile(r'project|kwork|service|offer')) or
                soup.find_all('div', attrs={'data-id': True}) or
                soup.find_all('div', attrs={'data-project-id': True}) or
                # Ищем по структуре с заголовками и ценами
                [card for card in soup.find_all('div') if 
                 card.find(['h1', 'h2', 'h3', 'h4']) and 
                 (card.find(text=re.compile(r'\d+\s*₽|\d+\s*руб', re.I)) or
                  card.find('span', class_=re.compile(r'price|cost|amount')))]
            )
            
            for card in order_cards:
                try:
                    order_data = self._parse_order_card(card)
                    if order_data:
                        orders.append(order_data)
                except Exception as e:
                    logger.warning(f"Failed to parse order card: {e}")
                    continue
            
            # Парсинг пагинации для определения общего количества
            total_orders = self._parse_pagination_info(soup)
            total_pages = (total_orders + limit - 1) // limit if total_orders else 1
            
            return {
                "success": True,
                "data": orders,
                "page": page,
                "limit": limit,
                "total": total_orders,
                "total_pages": total_pages,
                "has_next": page < total_pages
            }
            
        except Exception as e:
            logger.error(f"Error getting orders: {e}")
            return {
                "success": False,
                "error": f"Failed to get orders: {str(e)}",
                "data": []
            }
    
    def _parse_order_card(self, card_element) -> Optional[Dict[str, Any]]:
        """Парсинг одной карточки заказа"""
        try:
            order_data = {}
            
            # Извлечение ID заказа
            order_id = None
            if card_element.get('data-project-id'):
                order_id = card_element.get('data-project-id')
            else:
                # Поиск в ссылках
                link = card_element.find('a', href=re.compile(r'/project/(\d+)'))
                if link:
                    match = re.search(r'/project/(\d+)', link.get('href', ''))
                    if match:
                        order_id = match.group(1)
            
            if not order_id:
                return None
            
            order_data['id'] = order_id
            
            # Извлечение заголовка
            title_elem = (
                card_element.find('h2') or 
                card_element.find('h3') or
                card_element.find('a', class_=re.compile(r'title|name|link')) or
                card_element.find('div', class_=re.compile(r'title|name'))
            )
            
            if title_elem:
                order_data['title'] = title_elem.get_text(strip=True)
            else:
                order_data['title'] = "Без названия"
            
            # Извлечение описания
            desc_elem = (
                card_element.find('div', class_=re.compile(r'description|desc|text|content')) or
                card_element.find('p')
            )
            
            if desc_elem:
                # Очищаем описание от лишних элементов
                for unwanted in desc_elem.find_all(['script', 'style', 'button', 'a']):
                    unwanted.decompose()
                order_data['description'] = desc_elem.get_text(strip=True)[:500]  # Ограничиваем длину
            else:
                order_data['description'] = ""
            
            # Извлечение цены
            price_elem = (
                card_element.find('span', class_=re.compile(r'price|cost|amount')) or
                card_element.find('div', class_=re.compile(r'price|cost|amount')) or
                card_element.find(text=re.compile(r'\d+\s*руб|\d+\s*₽|\$\d+'))
            )
            
            if price_elem:
                if hasattr(price_elem, 'get_text'):
                    price_text = price_elem.get_text(strip=True)
                else:
                    price_text = str(price_elem).strip()
                
                # Извлекаем числовое значение цены
                price_match = re.search(r'(\d+(?:\s*\d+)*)', price_text.replace(' ', ''))
                if price_match:
                    order_data['price'] = int(price_match.group(1).replace(' ', ''))
                else:
                    order_data['price'] = None
            else:
                order_data['price'] = None
            
            # Извлечение категории
            category_elem = (
                card_element.find('span', class_=re.compile(r'category|tag|label')) or
                card_element.find('div', class_=re.compile(r'category|tag|label'))
            )
            
            if category_elem:
                order_data['category'] = category_elem.get_text(strip=True)
            else:
                order_data['category'] = "Без категории"
            
            # Извлечение даты публикации
            date_elem = (
                card_element.find('time') or
                card_element.find('span', class_=re.compile(r'date|time|published')) or
                card_element.find('div', class_=re.compile(r'date|time|published'))
            )
            
            if date_elem:
                date_text = date_elem.get_text(strip=True)
                order_data['published_at'] = date_text
            else:
                order_data['published_at'] = None
            
            # Извлечение количества откликов
            responses_elem = (
                card_element.find('span', class_=re.compile(r'responses|replies|offers')) or
                card_element.find('div', class_=re.compile(r'responses|replies|offers'))
            )
            
            if responses_elem:
                responses_text = responses_elem.get_text(strip=True)
                responses_match = re.search(r'(\d+)', responses_text)
                if responses_match:
                    order_data['responses_count'] = int(responses_match.group(1))
                else:
                    order_data['responses_count'] = 0
            else:
                order_data['responses_count'] = 0
            
            # Формирование ссылки на заказ
            order_data['url'] = f"{settings.KWORK_BASE_URL}/project/{order_id}"
            
            return order_data
            
        except Exception as e:
            logger.warning(f"Error parsing order card: {e}")
            return None
    
    def _parse_pagination_info(self, soup) -> int:
        """Извлечение информации о количестве заказов из пагинации"""
        try:
            # Поиск элементов пагинации
            pagination = soup.find('div', class_=re.compile(r'pagination|pager'))
            
            if pagination:
                # Поиск информации о общем количестве
                total_elem = pagination.find(text=re.compile(r'из\s*(\d+)|всего\s*(\d+)|total\s*(\d+)', re.I))
                if total_elem:
                    total_match = re.search(r'(\d+)', str(total_elem))
                    if total_match:
                        return int(total_match.group(1))
                
                # Поиск последней страницы
                last_page_elem = pagination.find('a', text=re.compile(r'\d+'))
                if last_page_elem:
                    pages = pagination.find_all('a', text=re.compile(r'\d+'))
                    if pages:
                        last_page = max([int(p.get_text()) for p in pages if p.get_text().isdigit()])
                        return last_page * 20  # Предполагаем 20 заказов на страницу
            
            # Если пагинация не найдена, считаем количество заказов на текущей странице
            order_cards = soup.find_all('div', class_=re.compile(r'project-item|order-item|card-item'))
            return len(order_cards)
            
        except Exception as e:
            logger.warning(f"Error parsing pagination: {e}")
            return 0
    
    async def respond_to_order(self, order_id: str, message: str, 
                             price: Optional[float] = None, 
                             files: Optional[List[str]] = None) -> Dict[str, Any]:
        """Отклик на заказ путем парсинга и отправки формы"""
        if not self.is_authenticated:
            raise Exception("Not authenticated")
        
        if not await account_rate_limiter.allow_response(self.account_id):
            raise Exception("Response rate limit exceeded")
        
        try:
            # Получаем страницу заказа для извлечения формы отклика
            order_url = f"/project/{order_id}"
            order_page = await self._make_request("GET", order_url)
            
            if order_page.status_code != 200:
                raise Exception(f"Failed to get order page: {order_page.status_code}")
            
            soup = BeautifulSoup(order_page.text, 'html.parser')
            
            # Поиск формы отклика
            response_form = (
                soup.find('form', {'id': re.compile(r'response|reply|offer|bid')}) or
                soup.find('form', class_=re.compile(r'response|reply|offer|bid')) or
                soup.find('form', action=re.compile(r'response|reply|offer|bid'))
            )
            
            if not response_form:
                # Поиск кнопки "Оставить предложение" для динамических форм
                response_button = soup.find('button', text=re.compile(r'оставить предложение|откликнуться|ответить', re.I))
                if response_button:
                    # Возможно форма загружается динамически
                    logger.warning("Response form might be loaded dynamically")
                    
                raise Exception("Response form not found on order page")
            
            # Извлечение action URL формы
            form_action = response_form.get('action', f"/project/{order_id}/response")
            if form_action.startswith('/'):
                form_action = form_action
            else:
                form_action = f"/project/{order_id}/response"
            
            # Поиск CSRF токена в форме
            csrf_token = None
            csrf_input = (
                response_form.find('input', {'name': '_token'}) or
                response_form.find('input', {'name': 'csrf_token'}) or
                response_form.find('input', {'name': 'authenticity_token'})
            )
            if csrf_input:
                csrf_token = csrf_input.get('value')
            
            # Если CSRF токен не найден в форме, используем общий
            if not csrf_token:
                csrf_token = self.csrf_token
            
            # Имитация задержки для естественного поведения
            await asyncio.sleep(random.uniform(2, 5))
            
            # Подготовка данных формы
            form_data = {
                "message": message,
                "text": message,  # Альтернативное имя поля
                "comment": message,  # Ещё одно возможное имя
            }
            
            # Добавление цены если указана
            if price is not None:
                form_data.update({
                    "price": str(int(price)),
                    "cost": str(int(price)),
                    "amount": str(int(price))
                })
            
            # Добавление CSRF токена
            if csrf_token:
                form_data["_token"] = csrf_token
                form_data["csrf_token"] = csrf_token
            
            # Поиск скрытых полей в форме
            hidden_inputs = response_form.find_all('input', {'type': 'hidden'})
            for hidden_input in hidden_inputs:
                name = hidden_input.get('name')
                value = hidden_input.get('value', '')
                if name and name not in form_data:
                    form_data[name] = value
            
            # Отправка формы
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": urljoin(settings.KWORK_BASE_URL, order_url),
                "X-Requested-With": "XMLHttpRequest"  # Может потребоваться для AJAX запросов
            }
            
            response = await self._make_request(
                "POST", 
                form_action,
                data=form_data,
                headers=headers
            )
            
            # Проверка успешности отправки
            if response.status_code in [200, 201, 302]:
                
                # Для редиректа проверяем, не на страницу ли ошибки
                if response.status_code == 302:
                    location = response.headers.get("location", "")
                    if any(error_path in location for error_path in ["/error", "/login", order_url]):
                        # Редирект на ошибку или обратно на заказ = неудача
                        return {
                            "success": False,
                            "message": "Response submission failed (redirect to error page)",
                            "order_id": order_id
                        }
                
                # Проверяем содержимое ответа для подтверждения
                response_text = response.text.lower()
                
                # Индикаторы успеха
                success_indicators = [
                    "предложение отправлено", "отклик отправлен", "ваше предложение добавлено",
                    "success", "спасибо", "отклик принят", "предложение принято"
                ]
                
                # Индикаторы ошибки
                error_indicators = [
                    "error", "ошибка", "неверный", "invalid", "failed", "не удалось",
                    "превышен лимит", "уже откликнулись", "заказ закрыт"
                ]
                
                if any(indicator in response_text for indicator in success_indicators):
                    logger.info(f"Successfully responded to order {order_id}")
                    return {
                        "success": True,
                        "message": "Response submitted successfully",
                        "order_id": order_id,
                        "response_message": message,
                        "price": price
                    }
                elif any(indicator in response_text for indicator in error_indicators):
                    error_msg = "Response submission failed (error detected in response)"
                    logger.error(f"Failed to respond to order {order_id}: {error_msg}")
                    return {
                        "success": False,
                        "message": error_msg,
                        "order_id": order_id
                    }
                else:
                    # Если нет явных индикаторов, считаем успешным при 200 статусе
                    return {
                        "success": True,
                        "message": "Response likely submitted (no clear confirmation)",
                        "order_id": order_id,
                        "response_message": message,
                        "price": price
                    }
                    
            else:
                raise Exception(f"HTTP error {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error responding to order {order_id}: {e}")
            return {
                "success": False,
                "message": f"Failed to respond to order: {str(e)}",
                "order_id": order_id
            }
    
    async def get_chat_messages(self, dialog_id: str, page: int = 1) -> Dict[str, Any]:
        """Получение сообщений чата путем парсинга HTML страницы"""
        if not self.is_authenticated:
            return {
                "success": False,
                "error": "Not authenticated",
                "data": []
            }
        
        try:
            # Формируем URL для страницы чата (username заказчика)
            chat_url = f"/inbox/{dialog_id}"
            params = {"page": page} if page > 1 else {}
            
            response = await self._make_request("GET", chat_url, params=params)
            
            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"Failed to get chat page: {response.status_code}",
                    "data": []
                }
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            messages = []
            
            # Поиск контейнера с сообщениями
            chat_container = (
                soup.find('div', class_=re.compile(r'chat|messages|dialog')) or
                soup.find('div', {'id': re.compile(r'chat|messages|dialog')}) or
                soup.find('main') or
                soup.find('section', class_=re.compile(r'chat|messages'))
            )
            
            if not chat_container:
                logger.warning("Chat container not found")
                return {
                    "success": True,
                    "data": [],
                    "dialog_id": dialog_id,
                    "page": page,
                    "total": 0
                }
            
            # Поиск сообщений
            message_elements = (
                chat_container.find_all('div', class_=re.compile(r'message|msg|chat-item')) or
                chat_container.find_all('li', class_=re.compile(r'message|msg')) or
                chat_container.find_all('article', class_=re.compile(r'message|msg'))
            )
            
            for msg_elem in message_elements:
                try:
                    message_data = self._parse_chat_message(msg_elem)
                    if message_data:
                        messages.append(message_data)
                except Exception as e:
                    logger.warning(f"Failed to parse message: {e}")
                    continue
            
            # Получение информации о диалоге
            dialog_info = self._parse_dialog_info(soup)
            
            return {
                "success": True,
                "data": messages,
                "dialog_id": dialog_id,
                "page": page,
                "total": len(messages),
                "dialog_info": dialog_info
            }
            
        except Exception as e:
            logger.error(f"Error getting chat messages: {e}")
            return {
                "success": False,
                "error": f"Failed to get chat messages: {str(e)}",
                "data": []
            }
    
    def _parse_chat_message(self, message_element) -> Optional[Dict[str, Any]]:
        """Парсинг одного сообщения из чата"""
        try:
            message_data = {}
            
            # Определение автора сообщения (свое/чужое)
            is_own = bool(
                message_element.find_parent(class_=re.compile(r'own|self|my|right')) or
                message_element.get('class') and any('own' in cls or 'self' in cls or 'my' in cls or 'right' in cls 
                                                   for cls in message_element.get('class', []))
            )
            
            message_data['is_own'] = is_own
            
            # Извлечение текста сообщения
            text_elem = (
                message_element.find('div', class_=re.compile(r'text|content|body|message-text')) or
                message_element.find('p') or
                message_element.find('span', class_=re.compile(r'text|content'))
            )
            
            if text_elem:
                # Очищаем от служебных элементов
                for unwanted in text_elem.find_all(['script', 'style', 'button', 'time']):
                    unwanted.decompose()
                message_data['text'] = text_elem.get_text(strip=True)
            else:
                # Если специфичный элемент не найден, берем весь текст
                message_data['text'] = message_element.get_text(strip=True)
            
            # Извлечение времени отправки
            time_elem = (
                message_element.find('time') or
                message_element.find('span', class_=re.compile(r'time|date|timestamp')) or
                message_element.find('div', class_=re.compile(r'time|date|timestamp'))
            )
            
            if time_elem:
                time_text = time_elem.get_text(strip=True)
                message_data['timestamp'] = time_text
                
                # Попытка извлечь datetime атрибут
                datetime_attr = time_elem.get('datetime')
                if datetime_attr:
                    message_data['datetime'] = datetime_attr
            else:
                message_data['timestamp'] = None
            
            # Поиск прикрепленных файлов
            file_elements = message_element.find_all('a', href=re.compile(r'\.(jpg|jpeg|png|gif|pdf|doc|docx|zip|rar)$', re.I))
            if file_elements:
                message_data['attachments'] = []
                for file_elem in file_elements:
                    attachment = {
                        'url': file_elem.get('href'),
                        'name': file_elem.get_text(strip=True) or file_elem.get('title', 'file')
                    }
                    message_data['attachments'].append(attachment)
            else:
                message_data['attachments'] = []
            
            # Извлечение автора (если не свое сообщение)
            if not is_own:
                author_elem = (
                    message_element.find('span', class_=re.compile(r'author|sender|name')) or
                    message_element.find('div', class_=re.compile(r'author|sender|name'))
                )
                if author_elem:
                    message_data['author'] = author_elem.get_text(strip=True)
                else:
                    message_data['author'] = "Заказчик"
            else:
                message_data['author'] = "Вы"
            
            # Проверяем, что сообщение содержит текст
            if not message_data.get('text'):
                return None
            
            return message_data
            
        except Exception as e:
            logger.warning(f"Error parsing chat message: {e}")
            return None
    
    def _parse_dialog_info(self, soup) -> Dict[str, Any]:
        """Извлечение информации о диалоге"""
        try:
            dialog_info = {}
            
            # Поиск заголовка диалога
            title_elem = (
                soup.find('h1') or
                soup.find('h2') or
                soup.find('div', class_=re.compile(r'title|header|name'))
            )
            
            if title_elem:
                dialog_info['title'] = title_elem.get_text(strip=True)
            
            # Поиск информации о заказе
            order_link = soup.find('a', href=re.compile(r'/project/(\d+)'))
            if order_link:
                order_match = re.search(r'/project/(\d+)', order_link.get('href', ''))
                if order_match:
                    dialog_info['order_id'] = order_match.group(1)
            
            # Поиск информации о собеседнике
            user_elem = soup.find('div', class_=re.compile(r'user|client|customer'))
            if user_elem:
                user_name_elem = user_elem.find('span', class_=re.compile(r'name|username'))
                if user_name_elem:
                    dialog_info['client_name'] = user_name_elem.get_text(strip=True)
            
            return dialog_info
            
        except Exception as e:
            logger.warning(f"Error parsing dialog info: {e}")
            return {}
    
    async def send_message(self, dialog_id: str, message: str, 
                          files: Optional[List[str]] = None) -> Dict[str, Any]:
        """Отправка сообщения в чат путем парсинга и отправки формы"""
        if not self.is_authenticated:
            raise Exception("Not authenticated")
        
        if not await account_rate_limiter.allow_message(self.account_id):
            raise Exception("Message rate limit exceeded")
        
        try:
            # Получаем страницу чата для извлечения формы отправки (username заказчика)
            chat_url = f"/inbox/{dialog_id}"
            chat_page = await self._make_request("GET", chat_url)
            
            if chat_page.status_code != 200:
                raise Exception(f"Failed to get chat page: {chat_page.status_code}")
            
            soup = BeautifulSoup(chat_page.text, 'html.parser')
            
            # Поиск формы отправки сообщения
            message_form = (
                soup.find('form', {'id': re.compile(r'message|send|chat')}) or
                soup.find('form', class_=re.compile(r'message|send|chat')) or
                soup.find('form', action=re.compile(r'message|send|chat'))
            )
            
            if not message_form:
                # Поиск по текстовому полю и кнопке отправки
                text_input = soup.find('textarea') or soup.find('input', {'type': 'text'})
                send_button = soup.find('button', text=re.compile(r'отправить|send', re.I))
                
                if text_input and send_button:
                    # Ищем родительскую форму
                    message_form = text_input.find_parent('form')
                
                if not message_form:
                    raise Exception("Message form not found in chat")
            
            # Извлечение action URL формы
            form_action = message_form.get('action', chat_url)
            if not form_action.startswith('/'):
                form_action = chat_url
            
            # Поиск CSRF токена
            csrf_token = None
            csrf_input = (
                message_form.find('input', {'name': '_token'}) or
                message_form.find('input', {'name': 'csrf_token'}) or
                soup.find('meta', {'name': 'csrf-token'})
            )
            
            if csrf_input:
                csrf_token = csrf_input.get('value') or csrf_input.get('content')
            
            if not csrf_token:
                csrf_token = self.csrf_token
            
            # Естественная задержка перед отправкой
            await asyncio.sleep(random.uniform(2, 4))
            
            # Подготовка данных формы
            form_data = {}
            
            # Поиск имени поля для сообщения
            message_field = (
                message_form.find('textarea') or
                message_form.find('input', {'type': 'text'}) or
                message_form.find('input', {'name': re.compile(r'message|text|content')})
            )
            
            if message_field:
                field_name = message_field.get('name', 'message')
                form_data[field_name] = message
            else:
                # Стандартные имена полей
                form_data.update({
                    'message': message,
                    'text': message,
                    'content': message
                })
            
            # Добавление CSRF токена
            if csrf_token:
                form_data['_token'] = csrf_token
                form_data['csrf_token'] = csrf_token
            
            # Добавление dialog_id если требуется
            form_data['dialog_id'] = dialog_id
            form_data['chat_id'] = dialog_id
            
            # Поиск всех скрытых полей
            hidden_inputs = message_form.find_all('input', {'type': 'hidden'})
            for hidden_input in hidden_inputs:
                name = hidden_input.get('name')
                value = hidden_input.get('value', '')
                if name and name not in form_data:
                    form_data[name] = value
            
            # Обработка файлов (пока только заглушка)
            if files:
                logger.warning("File attachments not yet implemented")
                # TODO: Реализовать загрузку файлов
            
            # Отправка формы
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": urljoin(settings.KWORK_BASE_URL, chat_url),
                "X-Requested-With": "XMLHttpRequest"
            }
            
            response = await self._make_request(
                "POST",
                form_action,
                data=form_data,
                headers=headers
            )
            
            # Проверка успешности отправки
            if response.status_code in [200, 201, 302]:
                
                # Для редиректа проверяем URL
                if response.status_code == 302:
                    location = response.headers.get("location", "")
                    if "/error" in location or "/login" in location:
                        return {
                            "success": False,
                            "message": "Message sending failed (redirect to error page)",
                            "dialog_id": dialog_id
                        }
                
                # Проверяем содержимое ответа
                response_text = response.text.lower()
                
                # Индикаторы успеха
                success_indicators = [
                    "сообщение отправлено", "message sent", "успешно", "success"
                ]
                
                # Индикаторы ошибки
                error_indicators = [
                    "error", "ошибка", "не удалось", "failed", "превышен лимит"
                ]
                
                if any(indicator in response_text for indicator in success_indicators):
                    logger.info(f"Successfully sent message to dialog {dialog_id}")
                    return {
                        "success": True,
                        "message": "Message sent successfully",
                        "dialog_id": dialog_id,
                        "sent_message": message
                    }
                elif any(indicator in response_text for indicator in error_indicators):
                    return {
                        "success": False,
                        "message": "Message sending failed (error detected)",
                        "dialog_id": dialog_id
                    }
                else:
                    # При отсутствии явных индикаторов считаем успешным
                    return {
                        "success": True,
                        "message": "Message likely sent (no clear confirmation)",
                        "dialog_id": dialog_id,
                        "sent_message": message
                    }
                    
            else:
                raise Exception(f"HTTP error {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error sending message to dialog {dialog_id}: {e}")
            return {
                "success": False,
                "message": f"Failed to send message: {str(e)}",
                "dialog_id": dialog_id
            }
    
    async def create_quark(self, title: str, description: str, 
                          category: str, price: float, 
                          stages: List[Dict]) -> Dict[str, Any]:
        """Создание предложения (Quark)"""
        if not self.is_authenticated:
            raise Exception("Not authenticated")
        
        quark_data = {
            "title": title,
            "description": description,
            "category": category,
            "price": price,
            "stages": stages
        }
        
        response = await self._make_request(
            "POST",
            "/api/quark",
            json=quark_data
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to create quark: {response.status_code}")

    # async def get_my_gigs(self) -> Dict[str, Any]:
    #     """Получение моих кворков путем парсинга JavaScript данных"""
    #     if not self.is_authenticated:
    #         return {
    #             "success": False,
    #             "error": "Not authenticated",
    #             "data": []
    #         }
    #
    #     try:
    #         # URL страницы с моими кворками
    #         my_gigs_url = "/manage_kworks"
    #
    #         response = await self._make_request("GET", my_gigs_url)
    #
    #         if response.status_code != 200:
    #             return {
    #                 "success": False,
    #                 "error": f"Failed to get my gigs page: {response.status_code}",
    #                 "data": []
    #             }
    #
    #         # Извлекаем данные из JavaScript
    #         state_data = self._extract_js_variable(response.text, "stateData")
    #
    #         if not state_data:
    #             return {
    #                 "success": False,
    #                 "error": "Не удалось извлечь данные состояния",
    #                 "data": []
    #             }
    #
    #         gigs = []
    #
    #         # Ищем данные кворков в groups.active.posts
    #         if isinstance(state_data, dict):
    #             groups = state_data.get("groups")
    #
    #             if not isinstance(groups, dict):
    #                 raise ValueError("stateData['groups'] отсутствует или не является словарем")
    #
    #             active_group = groups.get("active")
    #
    #             if not isinstance(active_group, dict):
    #                 raise ValueError("stateData['groups']['active'] отсутствует или не является словарем")
    #
    #             posts = active_group.get("posts", [])
    #
    #             for post in posts:
    #                 if isinstance(post, dict):
    #                     gig = {
    #                         "id": post.get("PID"),
    #                         "title": post.get("gtitle", ""),
    #                         "description": self._clean_html(post.get("gdesc", "")),
    #                         "price": post.get("price", 0),
    #                         "category": post.get("category_name", ""),
    #                         "url": post.get("url", ""),
    #                         "status": "active" if post.get("active") == "1" else "inactive",
    #                         "orders_count": post.get("order_count", 0),
    #                         "rating": post.get("rating", 0),
    #                         "views": post.get("viewcount", 0),
    #                         "photo": post.get("photo", ""),
    #                         "work_description": post.get("gwork", ""),
    #                         "days": post.get("days", 0)
    #                     }
    #                     gigs.append(gig)
    #
    #         # Извлекаем общую статистику
    #         total_count = state_data.get("total", len(gigs)) if isinstance(state_data, dict) else len(gigs)
    #
    #         return {
    #             "success": True,
    #             "data": gigs,
    #             "total": total_count,
    #             "error": None
    #         }
    #
    #     except Exception as e:
    #         logger.error(f"Error getting my gigs: {e}")
    #         return {
    #             "success": False,
    #             "error": f"Failed to get my gigs: {str(e)}",
    #             "data": []
    #         }

    async def get_my_gigs(self) -> Dict[str, Any]:
        """Получение моих кворков путем парсинга HTML через BeautifulSoup"""
        if not self.is_authenticated:
            return {
                "success": False,
                "error": "Not authenticated",
                "data": []
            }

        try:
            my_gigs_url = "/manage_kworks"
            response = await self._make_request("GET", my_gigs_url)

            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"Failed to get my gigs page: {response.status_code}",
                    "data": []
                }

            soup = BeautifulSoup(response.text, "html.parser")
            gigs = []

            # Предположим, что каждый кворк — это div с классом "gig-card"
            gig_cards = soup.select("div.gig-card")

            for card in gig_cards:
                try:
                    gig = {
                        "id": card.get("data-id"),  # или другой атрибут
                        "title": card.select_one(".gig-title").get_text(strip=True) if card.select_one(
                            ".gig-title") else "",
                        "description": card.select_one(".gig-desc").get_text(strip=True) if card.select_one(
                            ".gig-desc") else "",
                        "price": int(card.select_one(".gig-price").get_text(strip=True).replace("₸", "").replace(" ",
                                                                                                                 "")) if card.select_one(
                            ".gig-price") else 0,
                        "category": card.select_one(".gig-category").get_text(strip=True) if card.select_one(
                            ".gig-category") else "",
                        "url": card.select_one("a").get("href") if card.select_one("a") else "",
                        "status": "active" if "Активен" in card.get_text() else "inactive",
                        "orders_count": int(card.select_one(".gig-orders").get_text(strip=True)) if card.select_one(
                            ".gig-orders") else 0,
                        "rating": float(card.select_one(".gig-rating").get_text(strip=True)) if card.select_one(
                            ".gig-rating") else 0,
                        "views": int(card.select_one(".gig-views").get_text(strip=True)) if card.select_one(
                            ".gig-views") else 0,
                        "photo": card.select_one("img").get("src") if card.select_one("img") else "",
                        "work_description": "",  # Если есть — аналогично
                        "days": int(card.select_one(".gig-days").get_text(strip=True)) if card.select_one(
                            ".gig-days") else 0,
                    }
                    gigs.append(gig)
                except Exception as gig_err:
                    logger.warning(f"Ошибка при парсинге одного кворка: {gig_err}")
                    continue

            return {
                "success": True,
                "data": gigs,
                "total": len(gigs),
                "error": None
            }

        except Exception as e:
            logger.error(f"Ошибка при получении кворков: {e}")
            return {
                "success": False,
                "error": f"Failed to get my gigs: {str(e)}",
                "data": []
            }




    def _parse_gig_card(self, card_element) -> Optional[Dict[str, Any]]:
        """Парсинг одной карточки кворка"""
        try:
            gig_data = {}
            
            # Извлечение ID кворка
            gig_id = None
            if card_element.get('data-gig-id'):
                gig_id = card_element.get('data-gig-id')
            else:
                # Поиск в ссылках
                link = card_element.find('a', href=re.compile(r'/gig/(\d+)|/kwork/(\d+)'))
                if link:
                    match = re.search(r'/(?:gig|kwork)/(\d+)', link.get('href', ''))
                    if match:
                        gig_id = match.group(1)
            
            if gig_id:
                gig_data['id'] = gig_id
            
            # Извлечение заголовка
            title_elem = (
                card_element.find('h2') or 
                card_element.find('h3') or
                card_element.find('a', class_=re.compile(r'title|name|link')) or
                card_element.find('div', class_=re.compile(r'title|name'))
            )
            
            if title_elem:
                gig_data['title'] = title_elem.get_text(strip=True)
            
            # Извлечение описания
            desc_elem = (
                card_element.find('div', class_=re.compile(r'description|desc|text|content')) or
                card_element.find('p')
            )
            
            if desc_elem:
                gig_data['description'] = desc_elem.get_text(strip=True)[:200]  # Ограничиваем длину
            
            # Извлечение цены
            price_elem = (
                card_element.find('span', class_=re.compile(r'price|cost|amount')) or
                card_element.find('div', class_=re.compile(r'price|cost|amount'))
            )
            
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                price_match = re.search(r'(\d+(?:\s*\d+)*)', price_text.replace(' ', ''))
                if price_match:
                    gig_data['price'] = int(price_match.group(1).replace(' ', ''))
            
            # Извлечение статуса
            status_elem = (
                card_element.find('span', class_=re.compile(r'status|state')) or
                card_element.find('div', class_=re.compile(r'status|state'))
            )
            
            if status_elem:
                status_text = status_elem.get_text(strip=True).lower()
                if any(word in status_text for word in ['активен', 'active', 'опубликован', 'published']):
                    gig_data['status'] = 'active'
                elif any(word in status_text for word in ['неактивен', 'inactive', 'черновик', 'draft']):
                    gig_data['status'] = 'inactive'
                elif any(word in status_text for word in ['модерация', 'moderation', 'review']):
                    gig_data['status'] = 'moderation'
                else:
                    gig_data['status'] = 'unknown'
            else:
                gig_data['status'] = 'unknown'
            
            # Извлечение статистики
            views_elem = card_element.find(text=re.compile(r'просмотр|view', re.I))
            if views_elem:
                views_match = re.search(r'(\d+)', str(views_elem))
                if views_match:
                    gig_data['views'] = int(views_match.group(1))
            
            orders_elem = card_element.find(text=re.compile(r'заказ|order', re.I))
            if orders_elem:
                orders_match = re.search(r'(\d+)', str(orders_elem))
                if orders_match:
                    gig_data['orders'] = int(orders_match.group(1))
            
            # Формирование ссылки
            if gig_id:
                gig_data['url'] = f"{settings.KWORK_BASE_URL}/gig/{gig_id}"
            
            return gig_data if gig_data else None
            
        except Exception as e:
            logger.warning(f"Error parsing gig card: {e}")
            return None
    
    def _parse_gig_stats(self, soup) -> Dict[str, Any]:
        """Извлечение общей статистики кворков"""
        try:
            stats = {
                "total_views": 0,
                "total_orders": 0,
                "active_gigs": 0,
                "rating": None
            }
            
            # Поиск общих статистик на странице
            stats_container = soup.find('div', class_=re.compile(r'stats|statistics|summary'))
            
            if stats_container:
                # Поиск общих просмотров
                views_elem = stats_container.find(text=re.compile(r'просмотр|view', re.I))
                if views_elem:
                    views_match = re.search(r'(\d+)', str(views_elem))
                    if views_match:
                        stats["total_views"] = int(views_match.group(1))
                
                # Поиск общих заказов
                orders_elem = stats_container.find(text=re.compile(r'заказ|order', re.I))
                if orders_elem:
                    orders_match = re.search(r'(\d+)', str(orders_elem))
                    if orders_match:
                        stats["total_orders"] = int(orders_match.group(1))
                
                # Поиск рейтинга
                rating_elem = stats_container.find('span', class_=re.compile(r'rating|stars'))
                if rating_elem:
                    rating_text = rating_elem.get_text(strip=True)
                    rating_match = re.search(r'(\d+\.?\d*)', rating_text)
                    if rating_match:
                        stats["rating"] = float(rating_match.group(1))
            
            return stats
            
        except Exception as e:
            logger.warning(f"Error parsing gig stats: {e}")
            return {
                "total_views": 0,
                "total_orders": 0,
                "active_gigs": 0,
                "rating": None
            }
    
    async def update_gig(self, gig_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Обновление кворка с ограничениями безопасности
        Запрещено изменять цены, настройки оплаты и другие критичные параметры
        """
        if not self.is_authenticated:
            raise Exception("Not authenticated")
        
        if not await account_rate_limiter.allow_gig_edit(self.account_id):
            raise Exception("Gig edit rate limit exceeded")
        
        # Фильтрация запрещенных полей
        forbidden_fields = [
            "price", "payment_settings", "commission", "withdrawal",
            "financial_settings", "payment_methods", "pricing"
        ]
        
        filtered_updates = {}
        for key, value in updates.items():
            if key not in forbidden_fields:
                filtered_updates[key] = value
            else:
                logger.warning(f"Attempted to update forbidden field: {key}")
        
        if not filtered_updates:
            raise Exception("No allowed fields to update")
        
        response = await self._make_request(
            "PUT",
            f"/api/gigs/{gig_id}",
            json=filtered_updates
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to update gig: {response.status_code}")
    
    async def get_user_profile(self, username: str) -> Dict[str, Any]:
        """Получение информации о пользователе по username"""
        try:
            user_url = f"/user/{username}"
            response = await self._make_request("GET", user_url)
            
            if response.status_code != 200:
                raise Exception(f"Failed to get user profile: {response.status_code}")
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            user_info = {
                "username": username,
                "display_name": username,
                "rating": None,
                "reviews_count": 0,
                "level": "Standard",
                "avatar_url": None,
                "is_online": False,
                "description": ""
            }
            
            # Парсинг информации о пользователе
            try:
                # Поиск имени
                name_elem = soup.find('h1') or soup.find('span', class_=re.compile(r'username|name'))
                if name_elem:
                    user_info["display_name"] = name_elem.get_text(strip=True)
                
                # Поиск рейтинга
                rating_elem = soup.find('span', class_=re.compile(r'rating|stars'))
                if rating_elem:
                    rating_text = rating_elem.get_text(strip=True)
                    rating_match = re.search(r'(\d+\.?\d*)', rating_text)
                    if rating_match:
                        user_info["rating"] = float(rating_match.group(1))
                
                # Поиск описания профиля
                desc_elem = soup.find('div', class_=re.compile(r'description|about|bio'))
                if desc_elem:
                    user_info["description"] = desc_elem.get_text(strip=True)
                
            except Exception as e:
                logger.warning(f"Failed to parse user profile info: {e}")
            
            return user_info
            
        except Exception as e:
            logger.error(f"Error getting user profile: {e}")
            raise Exception(f"Failed to get user profile: {str(e)}")

    from bs4 import BeautifulSoup
    from datetime import datetime
    import re
    from typing import Dict, Any


    async def save_account_info_to_db(
            self,
            db: Database,

            account_id: int,
            info: Union[AccountInfo, Dict[str, Any]]
    ):
        """Сохраняет информацию об аккаунте в БД"""
        try:
            # Преобразуем dict → AccountInfo, если нужно
            account_info = info if isinstance(info, AccountInfo) else AccountInfo(**info)

            await db.execute_insert("""
                INSERT OR REPLACE INTO account_info (
                    id, username, display_name, full_name, avatar_url,
                    location, joined, is_online, profession, about_me,
                    skills, last_seen, account_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(account_info.id),
                account_info.username,
                account_info.display_name,
                account_info.full_name,
                account_info.avatar_url,
                account_info.location,
                account_info.joined,
                account_info.is_online,
                account_info.profession,
                account_info.about_me,
                json.dumps(account_info.skills),
                account_info.last_seen.isoformat() if account_info.last_seen else None,
                account_id
            ))
        except Exception as e:
            logger.warning(f"Ошибка при сохранении account_info в БД: {e}")





    async def get_account_info(self) -> Dict[str, Any]:
        """Получение информации об аккаунте с профиля пользователя"""
        cookies_path = f"uploads/cookies/cookies_{self.login}.json"

        with open(cookies_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = raw.get("cookies", raw)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()

            await context.add_cookies([
                {
                    "name": c["name"],
                    "value": c["value"],
                    "domain": ".kwork.ru",
                    "path": c.get("path", "/"),
                    "expires": int(c["expiry"]) if "expiry" in c else -1,
                    "secure": c.get("secure", False),
                    "httpOnly": c.get("httpOnly", False),
                    "sameSite": "Lax"
                }
                for c in cookies
            ])

            page = await context.new_page()
            await page.goto(f"https://kwork.ru/user/{self.login}", wait_until="networkidle")
            html = await page.content()
            await browser.close()

        soup = BeautifulSoup(html, "html.parser")

        # Парсинг полей
        avatar_el = soup.select_one(".profile-avatar__image img")
        display_name_el = soup.select_one("h1.user-username")
        full_name_el = soup.select_one(".user-fullname")
        location_el = soup.select_one(".user-info__location")
        joined_el = soup.select_one(".user-info__joined")
        profession_el = soup.select_one(".user-profession")
        about_me_el = soup.select_one(".user-about-me")
        skills_els = soup.select(".user-skills__item")
        is_online_el = soup.select_one(".online-status--online")

        account_info = {
            "id": self.account_id or "N/A",
            "username": self.login,
            "display_name": display_name_el.text.strip() if display_name_el else None,
            "full_name": full_name_el.text.strip() if full_name_el else None,
            "avatar_url": avatar_el["src"] if avatar_el else None,
            "location": location_el.text.strip() if location_el else None,
            "joined": joined_el.text.strip() if joined_el else None,
            "is_online": bool(is_online_el),
            "profession": profession_el.text.strip() if profession_el else None,
            "about_me": about_me_el.text.strip() if about_me_el else None,
            "skills": [el.text.strip() for el in skills_els],
            "last_seen": datetime.utcnow().isoformat()
        }

        return account_info

    async def get_my_quarks(self) -> Dict[str, Any]:
        """Получение моих Quark (предложений)"""
        if not self.is_authenticated:
            raise Exception("Not authenticated")
        
        try:
            # URL страницы с моими предложениями
            quarks_url = "/quarks"  # или "/proposals" или "/my-proposals"
            
            response = await self._make_request("GET", quarks_url)
            
            if response.status_code != 200:
                logger.warning(f"Failed to get quarks page: {response.status_code}")
                return {
                    "quarks": [],
                    "total": 0,
                    "message": "Quark page not accessible or not implemented yet"
                }
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            quarks = []
            
            # Поиск контейнеров с предложениями
            quark_cards = (
                soup.find_all('div', class_=re.compile(r'quark-item|proposal-item|offer-item')) or
                soup.find_all('article', class_=re.compile(r'quark|proposal|offer'))
            )
            
            for card in quark_cards:
                try:
                    quark_data = self._parse_quark_card(card)
                    if quark_data:
                        quarks.append(quark_data)
                except Exception as e:
                    logger.warning(f"Failed to parse quark card: {e}")
                    continue
            
            return {
                "quarks": quarks,
                "total": len(quarks),
                "message": "Basic quark parsing implemented"
            }
            
        except Exception as e:
            logger.error(f"Error getting my quarks: {e}")
            return {
                "quarks": [],
                "total": 0,
                "message": f"Quark parsing error: {str(e)}"
            }
    
    def _parse_quark_card(self, card_element) -> Optional[Dict[str, Any]]:
        """Парсинг одной карточки Quark"""
        try:
            quark_data = {}
            
            # Извлечение ID
            quark_id = card_element.get('data-quark-id') or card_element.get('data-id')
            if quark_id:
                quark_data['id'] = quark_id
            
            # Извлечение заголовка
            title_elem = (
                card_element.find('h2') or 
                card_element.find('h3') or
                card_element.find('a', class_=re.compile(r'title|name'))
            )
            
            if title_elem:
                quark_data['title'] = title_elem.get_text(strip=True)
            
            # Извлечение статуса
            status_elem = card_element.find('span', class_=re.compile(r'status|state'))
            if status_elem:
                quark_data['status'] = status_elem.get_text(strip=True)
            
            return quark_data if quark_data else None
            
        except Exception as e:
            logger.warning(f"Error parsing quark card: {e}")
            return None
    
    async def update_quark_stages(self, quark_id: str, stages: List[Dict]) -> Dict[str, Any]:
        """Обновление этапов Quark"""
        if not self.is_authenticated:
            raise Exception("Not authenticated")
        
        # Заглушка - в реальности нужно парсить и отправлять форму
        return {
            "success": False,
            "message": "Quark stage update not yet implemented"
        }
    
    # async def get_my_active_orders(self) -> Dict[str, Any]:
    #     """Получение активных заказов"""
    #     if not self.is_authenticated:
    #         return {
    #             "success": False,
    #             "error": "Not authenticated",
    #             "data": []
    #         }
    #
    #     try:
    #         # URL страницы с активными заказами
    #         active_orders_url = "/manage_orders"
    #
    #         response = await self._make_request("GET", active_orders_url)
    #
    #         if response.status_code != 200:
    #             return {
    #                 "success": False,
    #                 "error": f"Failed to get active orders page: {response.status_code}",
    #                 "data": []
    #             }
    #
    #         soup = BeautifulSoup(response.text, 'html.parser')
    #
    #         orders = []
    #
    #         # Поиск контейнеров с активными заказами
    #         order_cards = (
    #             soup.find_all('div', class_=re.compile(r'order-item|active-order|work-item')) or
    #             soup.find_all('article', class_=re.compile(r'order|work'))
    #         )
    #
    #         for card in order_cards:
    #             try:
    #                 order_data = self._parse_active_order_card(card)
    #                 if order_data:
    #                     orders.append(order_data)
    #             except Exception as e:
    #                 logger.warning(f"Failed to parse active order card: {e}")
    #                 continue
    #
    #         return {
    #             "success": True,
    #             "data": orders,
    #             "total": len(orders)
    #         }
    #
    #     except Exception as e:
    #         logger.error(f"Error getting active orders: {e}")
    #         return {
    #             "success": False,
    #             "error": f"Active orders parsing error: {str(e)}",
    #             "data": []
    #         }
    #

    # def _parse_active_order_card(self, card) -> Dict[str, Any]:
    #     """
    #     Парсит одну карточку активного заказа вида <div class="order-item">…</div>
    #     и возвращает словарь с нужными полями.
    #     """
    #     order = {}
    #
    #     # 1) ID заказа (берём из href="/track?id=...")
    #     link = card.select_one(".order-item__title a[href*='/track']")
    #     if link:
    #         m = re.search(r"[?&]id=(\d+)", link["href"])
    #         if m:
    #             order["id"] = m.group(1)
    #
    #     # 2) Заголовок
    #     title_div = card.select_one(".order-item__title > div")
    #     order["title"] = title_div.get_text(strip=True) if title_div else None
    #
    #     # 3) Дата создания (текст в order-item__info-date)
    #     date_div = card.select_one(".order-item__info-date")
    #     order["created_at"] = date_div.get_text(strip=True) if date_div else None
    #
    #     # 4) Оставшееся время (таймер)
    #     timer_div = card.select_one(".order-item__status-time-counter")
    #     order["time_left"] = timer_div.get_text(strip=True) if timer_div else None
    #
    #     # 5) Статус заказа ("В работе", "Завершён" и т.д.)
    #     status_div = card.select_one(".order-item__status-name > div")
    #     order["status"] = status_div.get_text(strip=True) if status_div else None
    #
    #     # 6) Клиент (username и URL)
    #     user_link = card.select_one(".order-item__user a")
    #     if user_link:
    #         order["client_username"] = user_link.get_text(strip=True)
    #         order["client_profile_url"] = user_link["href"]
    #
    #     # 7) Цена (число и валюта)
    #     cost_span = card.select_one(".order-item__cost-current")
    #     if cost_span:
    #         cost_text = cost_span.get_text()
    #         # убираем все кроме цифр и пробелов
    #         digits = re.sub(r"[^\d]", "", cost_text)
    #         order["price"] = int(digits) if digits else None
    #         order["currency"] = "RUB"
    #
    #     # 8) Дополнительные поля
    #     # (например, deadline можно из time_left или другого селектора)
    #
    #     return order
    #
    # async def get_my_active_orders(self) -> Dict[str, Any]:
    #     """Получение активных заказов через Selenium + парсинг страницы."""
    #     if not self.is_authenticated:
    #         return {"success": False, "error": "Not authenticated", "data": []}
    #
    #     # Открываем страницу
    #     self.browser.get(f"{self.BASE_URL}/manage_orders")
    #
    #     # Ждём, пока карточки загрузятся
    #     WebDriverWait(self.browser, 10).until(
    #         EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div.order-item"))
    #     )
    #
    #     cards = self.browser.find_elements(By.CSS_SELECTOR, "div.order-item")
    #     orders: List[Dict[str, Any]] = []
    #
    #     for card in cards:
    #         try:
    #             # 1) ID заказа
    #             link = card.find_element(By.CSS_SELECTOR, ".order-item__title a[href*='track']")
    #             href = link.get_attribute("href")
    #             m = re.search(r"[?&]id=(\d+)", href)
    #             order_id = m.group(1) if m else None
    #
    #             # 2) Заголовок
    #             title_div = card.find_element(By.CSS_SELECTOR, ".order-item__title > div:nth-of-type(2)")
    #             title = title_div.text.strip()
    #
    #             # 3) Дата создания
    #             date_div = card.find_element(By.CSS_SELECTOR, ".order-item__info-date")
    #             created_at = date_div.text.strip()
    #
    #             # 4) Таймер
    #             timer_div = card.find_element(By.CSS_SELECTOR, ".order-item__status-time-counter")
    #             time_left = timer_div.text.strip()
    #
    #             # 5) Статус
    #             status_div = card.find_element(By.CSS_SELECTOR, ".order-item__status-name > div")
    #             status = status_div.text.strip()
    #
    #             # 6) Клиент
    #             user_link = card.find_element(By.CSS_SELECTOR, ".order-item__user a")
    #             client_username = user_link.text.strip()
    #             client_profile_url = user_link.get_attribute("href")
    #
    #             # 7) Цена
    #             cost_span = card.find_element(By.CSS_SELECTOR, ".order-item__cost-current")
    #             cost_text = cost_span.text
    #             digits = re.sub(r"[^\d]", "", cost_text)
    #             price = int(digits) if digits else None
    #
    #             orders.append({
    #                 "id": order_id,
    #                 "title": title,
    #                 "created_at": created_at,
    #                 "time_left": time_left,
    #                 "status": status,
    #                 "client_username": client_username,
    #                 "client_profile_url": client_profile_url,
    #                 "price": price,
    #                 "currency": "RUB"
    #             })
    #         except Exception:
    #             # если какая‑то карточка вдруг не уложилась в селекторы
    #             continue
    #
    #     return {"success": True, "data": orders, "total": len(orders)}
    #
    #

    # def _parse_active_order_card(self, card_element) -> Optional[Dict[str, Any]]:
    #     """Парсинг одной карточки активного заказа"""
    #     try:
    #         order_data = {}
    #
    #         # Извлечение ID заказа
    #         order_id = card_element.get('data-order-id') or card_element.get('data-id')
    #         if not order_id:
    #             link = card_element.find('a', href=re.compile(r'/order/(\d+)'))
    #             if link:
    #                 match = re.search(r'/order/(\d+)', link.get('href', ''))
    #                 if match:
    #                     order_id = match.group(1)
    #
    #         if order_id:
    #             order_data['id'] = order_id
    #
    #         # Извлечение заголовка
    #         title_elem = (
    #             card_element.find('h2') or
    #             card_element.find('h3') or
    #             card_element.find('a', class_=re.compile(r'title|name'))
    #         )
    #
    #         if title_elem:
    #             order_data['title'] = title_elem.get_text(strip=True)
    #
    #         # Извлечение статуса/этапа
    #         stage_elem = (
    #             card_element.find('span', class_=re.compile(r'stage|status|step')) or
    #             card_element.find('div', class_=re.compile(r'stage|status|step'))
    #         )
    #
    #         if stage_elem:
    #             order_data['stage'] = stage_elem.get_text(strip=True)
    #
    #         # Извлечение дедлайна
    #         deadline_elem = (
    #             card_element.find('time') or
    #             card_element.find('span', class_=re.compile(r'deadline|due|date'))
    #         )
    #
    #         if deadline_elem:
    #             order_data['deadline'] = deadline_elem.get_text(strip=True)
    #
    #         return order_data if order_data else None
    #
    #     except Exception as e:
    #         logger.warning(f"Error parsing active order card: {e}")
    #         return None
    from bs4 import BeautifulSoup
    import json
    import os
    from typing import List, Dict
    from playwright.async_api import async_playwright



    async def parse_kwork_details(self,url: str, context) -> Dict[str, str]:
        page = await context.new_page()
        await page.goto(url, wait_until="networkidle")
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")

        try:
            title = soup.select_one("h1.kwork-title").text.strip()
            description = soup.select_one("#description-text").text.strip()
            requirements = soup.select_one("#requiredInfo-text").text.strip()
            dev_type = soup.find("strong", string="Вид:").find_next("span").text.strip()
            language = soup.find("strong", string="Язык разработки:").find_next("span").text.strip()
            volume = soup.select_one("#kwork-volume-text").text.strip()
            duration = soup.select_one(".js-order-time").text.strip()
            likes = soup.select_one(".total-like-count")
            like_count = likes.text.strip() if likes else "0"

            return {
                "title": title,
                "description": description,
                "requirements": requirements,
                "type": dev_type,
                "language": language,
                "volume": volume,
                "duration": duration,
                "likes": like_count,
                "url": url
            }

        except Exception as e:
            print(f"❌ Ошибка парсинга кворка: {e}")
            return {}
        finally:
            await page.close()

    import os
    import json
    from urllib.parse import urljoin
    from typing import List, Dict
    from bs4 import BeautifulSoup
    from playwright.async_api import async_playwright

    async def parse_all_kworks_with_details(self, login: str) -> List[Dict[str, str]]:
        cookies_path = f"uploads/cookies/cookies_{login}.json"
        with open(cookies_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = raw.get("cookies", raw)

        results = []

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()

            await context.add_cookies([
                {
                    "name": c["name"],
                    "value": c["value"],
                    "domain": ".kwork.ru",
                    "path": c.get("path", "/"),
                    "expires": int(c["expiry"]) if "expiry" in c else -1,
                    "secure": c.get("secure", False),
                    "httpOnly": c.get("httpOnly", False),
                    "sameSite": "Lax"
                }
                for c in cookies
            ])

            page = await context.new_page()
            await page.goto("https://kwork.ru/manage_kworks", wait_until="networkidle")

            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            items = soup.select(".manage-kworks-item__inner")

            print(f"🔍 Найдено кворков: {len(items)}")

            for item in items:
                try:
                    title_el = item.select_one(".manage-kworks-item__title a")
                    img_el = item.select_one(".manage-kworks-item__img-responsive img")
                    views_el = item.select_one(".icon-eye + .ml5")
                    sales_el = item.select_one(".icon-cart + .ml5")
                    earned_el = item.select_one(".icon-earn + .ml5")
                    price_el = item.select_one(".manage-kworks-item__price span")
                    competition_el = item.select_one(".manage-kworks-item__competition-title")

                    base_data = {
                        "title": title_el.text.strip() if title_el else "",
                        "url": urljoin("https://kwork.ru", title_el["href"]) if title_el else "",
                        "image": img_el["src"] if img_el else "",
                        "views": views_el.text.strip() if views_el else "0",
                        "sales": sales_el.text.strip() if sales_el else "0",
                        "earned": earned_el.text.strip() if earned_el else "0",
                        "price": price_el.text.strip().replace("\xa0", " ") if price_el else "—",
                        "competition": competition_el.text.strip() if competition_el else "—"
                    }

                    # Доп. инфа из страницы самого кворка
                    if base_data["url"]:
                        details = await self.parse_kwork_details(base_data["url"], context)
                        base_data.update(details)

                    results.append(base_data)

                except Exception as e:
                    print(f"❌ Ошибка при обработке кворка: {e}")

            await browser.close()

        # ✅ Сохраняем результат в JSON-файл
        output_dir = os.path.join("uploads", "kworks")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"kworks_{login}.json")

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        print(f"✅ Результаты сохранены в {output_path}")

        return results

    async def parse_chat_messages(self, username: str) -> List[Dict[str, Any]]:
        messages = []
        chat_url = f"https://kwork.ru/inbox/{username.lower()}"
        print(f"🔗 Открытие чата: {chat_url}")

        cookies_path = f"uploads/cookies/cookies_{self.login}.json"
        with open(cookies_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = raw.get("cookies", raw)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()

            await context.add_cookies([
                {
                    "name": c["name"],
                    "value": c["value"],
                    "domain": ".kwork.ru",
                    "path": c.get("path", "/"),
                    "expires": int(c["expiry"]) if "expiry" in c else -1,
                    "secure": c.get("secure", False),
                    "httpOnly": c.get("httpOnly", False),
                    "sameSite": "Lax"
                }
                for c in cookies
            ])

            page = await context.new_page()

            try:
                await page.goto(chat_url, wait_until="networkidle")
                await page.wait_for_selector(".conversation-message-item", timeout=60000)

                html = await page.content()
                soup = BeautifulSoup(html, "html.parser")

                for item in soup.select(".conversation-message-item"):
                    message_data = {
                        "from": "",  # 👈 отправитель
                        "time": "",  # 👈 время
                        "text": "",
                        "images": [],
                        "files": [],
                        "archive_link": None
                    }

                    # 🔹 Отправитель
                    sender_block = item.select_one(".username-c a")
                    if sender_block:
                        message_data["from"] = sender_block.text.strip()

                    # 🔹 Время
                    time_block = item.select_one(".time-c")
                    if time_block:
                        message_data["time"] = time_block.text.strip()

                    # 🔹 Основной текст
                    html_block = item.select_one(".cm-message-html")
                    if html_block:
                        message_data["text"] = html_block.get_text(strip=True)

                    # 🔹 Альтернативный текст (например, в предложениях)
                    alt_text_block = item.select_one(".content-offer-c__body p")
                    if alt_text_block:
                        message_data["text"] += "\n" + alt_text_block.get_text(strip=True)

                    # 🔹 Изображения
                    for img in item.select("img"):
                        src = img.get("src")
                        if src and src.startswith("http"):
                            message_data["images"].append(src)

                    # 🔹 Файлы
                    for file_link in item.select("a.fdownload, a.file-list__container"):
                        href = file_link.get("href")
                        if href and href.startswith("http"):
                            message_data["files"].append(href)

                    # 🔹 Ссылка на скачивание архива
                    archive_link = item.select_one(".file-list__download-all a")
                    if archive_link and archive_link.get("href"):
                        message_data["archive_link"] = "https://kwork.ru" + archive_link["href"]

                    messages.append(message_data)

                print(f"✅ Найдено сообщений: {len(messages)}")

            except Exception as e:
                print(f"❌ Ошибка при парсинге чата {username}: {e}")

            finally:
                await browser.close()

        return messages

    async def parse_chats_with_messages(self) -> List[Dict[str, Any]]:
        import os
        chats = []
        cookies_path = f"uploads/cookies/cookies_{self.login}.json"

        with open(cookies_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = raw.get("cookies", raw)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()

            await context.add_cookies([
                {
                    "name": c["name"],
                    "value": c["value"],
                    "domain": ".kwork.ru",
                    "path": c.get("path", "/"),
                    "expires": int(c["expiry"]) if "expiry" in c else -1,
                    "secure": c.get("secure", False),
                    "httpOnly": c.get("httpOnly", False),
                    "sameSite": "Lax"
                }
                for c in cookies
            ])

            page = await context.new_page()
            await page.goto("https://kwork.ru/inbox", wait_until="networkidle")
            await page.wait_for_selector(".chat__list-item", timeout=30000)

            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            items = soup.select(".chat__list-item")

            print(f"🔍 Найдено {len(items)} чатов")

            for item in items:
                try:
                    username_el = item.select_one(".chat__list-user")
                    message = item.select_one(".chat__list-message")
                    date = item.select_one(".chat__list-date")

                    username = username_el.text.strip() if username_el else ""
                    chat_messages = await self.parse_chat_messages(username)

                    chat_data = {
                        "username": username,
                        "message": message.text.strip() if message else "",
                        "date": date.text.strip() if date else "",
                        "messages": chat_messages
                    }
                    chats.append(chat_data)

                    # 📁 Создаём папку для чата
                    safe_username = username.replace("/", "_").replace("\\", "_")
                    chat_folder = f"uploads/chats/{safe_username}"
                    os.makedirs(chat_folder, exist_ok=True)

                    # 💾 Сохраняем историю сообщений
                    with open(os.path.join(chat_folder, "history.json"), "w", encoding="utf-8") as f:
                        json.dump(chat_data, f, ensure_ascii=False, indent=2)

                except Exception as e:
                    print(f"❌ Ошибка парсинга чата: {e}")

            await browser.close()

        return chats

    async def parse_chats(self) -> List[Dict[str, Any]]:
        chats = []
        cookies_path = f"uploads/cookies/cookies_{self.login}.json"

        with open(cookies_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = raw.get("cookies", raw)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()

            # Устанавливаем куки
            await context.add_cookies([
                {
                    "name": c["name"],
                    "value": c["value"],
                    "domain": ".kwork.ru",
                    "path": c.get("path", "/"),
                    "expires": int(c["expiry"]) if "expiry" in c else -1,
                    "secure": c.get("secure", False),
                    "httpOnly": c.get("httpOnly", False),
                    "sameSite": "Lax"
                }
                for c in cookies
            ])

            page = await context.new_page()
            await page.goto("https://kwork.ru/inbox", wait_until="networkidle")

            # Ждём загрузки чатов
            await page.wait_for_selector(".chat__list-item", timeout=30000)

            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            items = soup.select(".chat__list-item")

            print(f"🔍 Найдено {len(items)} чатов")

            for item in items:
                try:
                    username = item.select_one(".chat__list-user")
                    message = item.select_one(".chat__list-message")
                    date = item.select_one(".chat__list-date")

                    chat = {
                        "username": username.text.strip() if username else "",
                        "message": message.text.strip() if message else "",
                        "date": date.text.strip() if date else "",
                    }
                    chats.append(chat)
                except Exception as e:
                    print(f"❌ Ошибка парсинга чата: {e}")

            await browser.close()

        return chats

    async def save_orders_to_db(
            self,
            db: Database,
            user_id: int,
            account_id: int,
            orders: List[Union[ParsedOrder, Dict[str, Any]]]
    ):
        # Преобразуем словари в объекты ParsedOrder
        parsed_orders = [
            ParsedOrder(**order) if isinstance(order, dict) else order
            for order in orders
        ]

        for order in parsed_orders:
            try:
                files_json = json.dumps(order.files)
                await db.execute_insert("""
                    INSERT OR REPLACE INTO orders (
                        id, title, url, buyer_name, buyer_url, ordered_at, time_left,
                        price, status, message, duration, files, account_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    order.id,
                    order.title,
                    order.url,
                    order.buyer_name,
                    order.buyer_url,
                    order.ordered_at,
                    order.time_left,
                    order.price,
                    order.status,
                    order.message,
                    order.duration,
                    files_json,
                    account_id
                ))
            except Exception as e:
                logger.warning(f"Ошибка при сохранении заказа {order.id} в БД: {e}")

    # async def parse_orders(self) -> List[ParsedOrder]:
    #     from pathlib import Path
    #
    #     cookies_path = Path(f"uploads/cookies/cookies_{self.login}.json")
    #     if not cookies_path.exists():
    #         raise FileNotFoundError(f"Cookie-файл не найден: {cookies_path}")
    #     from playwright.async_api import async_playwright
    #     with open(cookies_path, "r", encoding="utf-8") as f:
    #         raw = json.load(f)
    #         cookies = raw.get("cookies", raw)
    #         if not isinstance(cookies, list):
    #             raise ValueError("Формат cookies некорректен")
    #
    #     async with async_playwright() as p:
    #         browser = await p.chromium.launch(headless=True)
    #         context = await browser.new_context()
    #         await context.add_cookies(cookies)
    #         page = await context.new_page()
    #
    #         await page.goto("https://kwork.ru/projects?c=41")
    #
    #         await page.wait_for_selector("div.feed.row > div")
    #
    #         content = await page.content()
    #         soup = BeautifulSoup(content, "html.parser")
    #         rows = soup.select("div.feed.row > div")
    #         orders: List[ParsedOrder] = []
    #
    #         for row in rows:
    #             try:
    #                 parsed = self._parse_order_item(row)
    #                 order_url = parsed["url"]
    #                 detailed_info = await self.parse_order_details(page, order_url)
    #                 parsed.update(detailed_info)
    #                 parsed["account_id"] = self.account_id
    #                 orders.append(ParsedOrder(**parsed))
    #             except Exception as e:
    #                 logger.warning(f"Ошибка парсинга заказа: {e}")
    #
    #         await browser.close()
    #         return orders
    #
    #












    async def parse_orders(self) -> List[Dict[str, Any]]:
        orders = []
        # Загружаем cookies
        cookies_path = f"uploads/cookies/cookies_{self.login}.json"
        with open(cookies_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cookies = raw.get("cookies", raw)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()

            # Устанавливаем куки
            await context.add_cookies([
                {
                    "name": c["name"],
                    "value": c["value"],
                    "domain": ".kwork.ru",
                    "path": c.get("path", "/"),
                    "expires": int(c["expiry"]) if "expiry" in c else -1,
                    "secure": c.get("secure", False),
                    "httpOnly": c.get("httpOnly", False),
                    "sameSite": "Lax"
                }
                for c in cookies
            ])

            page = await context.new_page()
            await page.goto("https://kwork.ru/manage_orders", wait_until="networkidle")
            await page.wait_for_selector("table.m-order-table tbody tr", timeout=30000)

            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            rows = soup.select("table.m-order-table tbody tr")
            print(f"🔍 Найдено {len(rows)} заказов")

            for row in rows:
                try:
                    parsed = self._parse_order_item(row)
                    order_url = parsed["url"]
                    detailed_info = await self.parse_order_details(page, order_url)
                    parsed.update(detailed_info)
                    orders.append(parsed)
                except Exception as e:
                    print(f"❌ Ошибка парсинга строки: {e}")

            await browser.close()

        return orders



    async def parse_order_details(self, page, order_url: str) -> Dict[str, Any]:
        await page.goto(order_url, wait_until="networkidle")
        await page.wait_for_selector(".track--item__main", timeout=10000)

        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")

        result = {
            "url": order_url,
            "message": "",
            "files": []
        }

        # 1. Имя покупателя (если есть)
        login_el = soup.select_one(".track--item__information-login")
        if login_el:
            result["buyer_name"] = login_el.get_text(strip=True)

        # 2. Сообщение (первое)
        msg_el = soup.select_one(".js-track-text-message")
        if msg_el:
            result["message"] = msg_el.get_text(strip=True)

        # 3. Файлы
        file_items = soup.select(".file-list__item a[download]")
        for item in file_items:
            href = item.get("href")
            name_el = item.select_one(".fname")
            name = name_el.get_text(strip=True) if name_el else href.split("/")[-1]
            result["files"].append({
                "name": name,
                "url": href.split("?")[0]
            })

        # 🔍 4. Дополнительно из верхней части заказа
        # Заголовок заказа
        title_el = soup.select_one(".track-page__header-h1 div")
        if title_el:
            result["title"] = title_el.get_text(strip=True)

        # ID заказа

        # Срок выполнения
        duration_el = soup.select_one(".order-info__time--current")
        if duration_el:
            result["duration"] = duration_el.get_text(strip=True)

        # Цена
        price_el = soup.select_one(".order-info__price--current")
        if price_el:
            price_text = price_el.get_text(strip=True)
            match = re.search(r"(\d[\d\s]*)", price_text)
            if match:
                result["price"] = int(match.group(1).replace(" ", ""))



        return result

    def _parse_order_item(self, item) -> Dict[str, Any]:
        order = {}
        try:
            title_link = item.select_one("td.order-item__title-cell a.order-item__title-wrap")
            if title_link:
                title = title_link.select_one(".order-item__title-link")
                href = title_link.get("href", "")
                order["title"] = title.get_text(strip=True) if title else ""
                order["url"] = "https://kwork.ru" + href
                order["id"] = href.split("=")[-1]

            buyer_elem = item.select_one("td.order-item__user-cell a.order-item__user-link")
            if buyer_elem:
                order["buyer_name"] = buyer_elem.get_text(strip=True)
                order["buyer_url"] = buyer_elem["href"]

            date_elem = item.select_one("td.order-list__item-date div")
            if date_elem:
                order["ordered_at"] = date_elem.get_text(strip=True)

            left_elem = item.select_one("td:nth-of-type(5) span.tooltipster")
            if left_elem:
                order["time_left"] = left_elem.get_text(strip=True)

            price_elem = item.select_one("td:nth-of-type(6) span.order-list-table__price")
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                match = re.search(r"(\d[\d\s]*)", price_text)
                if match:
                    order["price"] = int(match.group(1).replace(" ", ""))

            status_elem = item.select_one("td:nth-of-type(8) .order-item__status-name")
            if status_elem:
                order["status"] = status_elem.get_text(strip=True)

        except Exception as e:
            order["parsing_error"] = str(e)

        return order
    async def update_order_stage(self, order_id: str, stage: str, message: str = None, files: List[str] = None) -> Dict[str, Any]:
        """Обновление этапа заказа"""
        if not self.is_authenticated:
            raise Exception("Not authenticated")
        
        # Заглушка - в реальности нужно парсить и отправлять форму
        return {
            "success": False,
            "message": "Order stage update not yet implemented"
        }
    
    async def deliver_order(self, order_id: str, message: str, files: List[str]) -> Dict[str, Any]:
        """Сдача заказа"""
        if not self.is_authenticated:
            raise Exception("Not authenticated")
        
        # Заглушка - в реальности нужно парсить и отправлять форму
        return {
            "success": False,
            "message": "Order delivery not yet implemented"
        }
    
    async def get_chat_list(self) -> Dict[str, Any]:
        """Получение списка диалогов"""
        if not self.is_authenticated:
            return {
                "success": False,
                "error": "Not authenticated",
                "data": []
            }
        
        try:
            # URL страницы со списком чатов
            chats_url = "/inbox"
            
            response = await self._make_request("GET", chats_url)
            
            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"Failed to get chat list page: {response.status_code}",
                    "data": []
                }
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            dialogs = []
            
            # Поиск контейнеров с диалогами
            dialog_cards = (
                soup.find_all('div', class_=re.compile(r'dialog-item|chat-item|conversation-item')) or
                soup.find_all('li', class_=re.compile(r'dialog|chat|conversation')) or
                soup.find_all('a', class_=re.compile(r'dialog|chat|conversation'))
            )
            
            for card in dialog_cards:
                try:
                    dialog_data = self._parse_dialog_card(card)
                    if dialog_data:
                        dialogs.append(dialog_data)
                except Exception as e:
                    logger.warning(f"Failed to parse dialog card: {e}")
                    continue
            
            return {
                "success": True,
                "data": dialogs,
                "total": len(dialogs)
            }
            
        except Exception as e:
            logger.error(f"Error getting chat list: {e}")
            return {
                "success": False,
                "error": f"Chat list parsing error: {str(e)}",
                "data": []
            }
    
    def _parse_dialog_card(self, card_element) -> Optional[Dict[str, Any]]:
        """Парсинг одной карточки диалога"""
        try:
            dialog_data = {}
            
            # Извлечение ID диалога
            dialog_id = card_element.get('data-dialog-id') or card_element.get('data-id')
            if not dialog_id:
                # Поиск в ссылке
                if card_element.name == 'a':
                    href = card_element.get('href', '')
                else:
                    link = card_element.find('a')
                    href = link.get('href', '') if link else ''
                
                if href:
                    # Ищем username в ссылках вида /inbox/username
                    match = re.search(r'/inbox/([a-zA-Z0-9_]+)', href)
                    if match:
                        dialog_id = match.group(1)
            
            if dialog_id:
                dialog_data['id'] = dialog_id
            
            # Извлечение имени собеседника
            name_elem = (
                card_element.find('span', class_=re.compile(r'name|username|client')) or
                card_element.find('div', class_=re.compile(r'name|username|client')) or
                card_element.find('h3') or card_element.find('h4')
            )
            
            if name_elem:
                dialog_data['client_name'] = name_elem.get_text(strip=True)
            
            # Извлечение последнего сообщения
            last_message_elem = (
                card_element.find('div', class_=re.compile(r'last-message|message-preview')) or
                card_element.find('p', class_=re.compile(r'preview|summary'))
            )
            
            if last_message_elem:
                dialog_data['last_message'] = last_message_elem.get_text(strip=True)[:100]
            
            # Извлечение времени последнего сообщения
            time_elem = (
                card_element.find('time') or
                card_element.find('span', class_=re.compile(r'time|date|timestamp'))
            )
            
            if time_elem:
                dialog_data['last_message_time'] = time_elem.get_text(strip=True)
            
            # Проверка на непрочитанные сообщения
            unread_elem = card_element.find('span', class_=re.compile(r'unread|badge|counter'))
            if unread_elem:
                unread_text = unread_elem.get_text(strip=True)
                unread_match = re.search(r'(\d+)', unread_text)
                if unread_match:
                    dialog_data['unread_count'] = int(unread_match.group(1))
                else:
                    dialog_data['unread_count'] = 1
            else:
                dialog_data['unread_count'] = 0
            
            return dialog_data if dialog_data else None
            
        except Exception as e:
            logger.warning(f"Error parsing dialog card: {e}")
            return None

    def _extract_js_variable(self, html: str, variable_name: str) -> Any:
        """Извлекает значение JavaScript переменной из HTML"""
        try:
            # Специальный подход для сложных объектов
            start_pattern = rf'window\.{re.escape(variable_name)}\s*=\s*'
            start_match = re.search(start_pattern, html)
            
            if not start_match:
                logger.warning(f"Переменная {variable_name} не найдена")
                return None
            
            start_pos = start_match.end()
            
            # Ищем начало JSON объекта или строки
            content_start = html[start_pos:].lstrip()
            
            if content_start.startswith('{'):
                # Это JSON объект - ищем соответствующую закрывающую скобку
                js_content = self._extract_json_object(html[start_pos:])
            elif content_start.startswith('['):
                # Это JSON массив - ищем соответствующую закрывающую скобку
                js_content = self._extract_json_array(html[start_pos:])
            elif content_start.startswith('"'):
                # Это строка в кавычках
                end_quote = content_start.find('"', 1)
                next_semicolon = content_start.find(';')
                if end_quote != -1 and (next_semicolon == -1 or end_quote < next_semicolon):
                    js_content = content_start[1:end_quote]
                    return js_content
                else:
                    # Строка не закрыта - берем до точки с запятой
                    if next_semicolon != -1:
                        js_content = content_start[:next_semicolon].strip()
                        if js_content.startswith('"') and js_content.endswith('"'):
                            return js_content[1:-1]
                        return js_content
            else:
                # Простое значение до точки с запятой
                end_pos = content_start.find(';')
                if end_pos != -1:
                    js_content = content_start[:end_pos].strip()
                    return js_content
                
            if js_content:
                # Попытка парсинга JSON
                if js_content.startswith('{') or js_content.startswith('['):
                    try:
                        return json.loads(js_content)
                    except json.JSONDecodeError as e:
                        logger.warning(f"Не удалось распарсить {variable_name} как JSON: {str(e)[:100]}")
                        return js_content
                else:
                    return js_content
            
            return None
            
        except Exception as e:
            logger.error(f"Ошибка извлечения переменной {variable_name}: {e}")
            return None

    def _extract_json_object(self, text: str) -> str:
        """Извлекает JSON объект, находя соответствующую закрывающую скобку"""
        text = text.lstrip()
        if not text.startswith('{'):
            return ""
        
        brace_count = 0
        in_string = False
        escape_next = False
        
        for i, char in enumerate(text):
            if escape_next:
                escape_next = False
                continue
                
            if char == '\\':
                escape_next = True
                continue
                
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
                
            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    
                if brace_count == 0:
                    return text[:i + 1]
        
        # Если не нашли закрывающую скобку, возвращаем до первой точки с запятой
        semicolon_pos = text.find(';')
        if semicolon_pos != -1:
            return text[:semicolon_pos]
        
        return ""

    def _extract_json_array(self, text: str) -> str:
        """Извлекает JSON массив, находя соответствующую закрывающую скобку"""
        text = text.lstrip()
        if not text.startswith('['):
            return ""
        
        bracket_count = 0
        in_string = False
        escape_next = False
        
        for i, char in enumerate(text):
            if escape_next:
                escape_next = False
                continue
                
            if char == '\\':
                escape_next = True
                continue
                
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
                
            if not in_string:
                if char == '[':
                    bracket_count += 1
                elif char == ']':
                    bracket_count -= 1
                    
                if bracket_count == 0:
                    return text[:i + 1]
        
        # Если не нашли закрывающую скобку, возвращаем до первой точки с запятой
        semicolon_pos = text.find(';')
        if semicolon_pos != -1:
            return text[:semicolon_pos]
        
        return ""
    
    def _clean_html(self, html_text: str) -> str:
        """Очищает HTML теги и сущности"""
        if not html_text:
            return ""
        
        # Заменяем HTML сущности
        text = html_text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        
        # Удаляем HTML теги
        soup = BeautifulSoup(text, 'html.parser')
        return soup.get_text(strip=True)

    async def get_projects_from_db(db, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        query = """
               SELECT
                   id,
                   project_id,
                   title,
                   description,
                   budget,
                   max_budget,
                   buyer_username,
                   projects_posted,
                   hire_rate,
                   proposals_count,
                   time_left,
                   is_viewed,
                   created_at
               FROM projects
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?
           """
        rows = await db.fetch_all(query, (limit, offset))

        return [
            {
                "id": row[0],
                "project_id": row[1],
                "title": row[2],
                "description": row[3],
                "budget": row[4],
                "max_budget": row[5],
                "buyer_username": row[6],
                "projects_posted": row[7],
                "hire_rate": row[8],
                "proposals_count": row[9],
                "time_left": row[10],
                "is_viewed": bool(row[11]),
                "created_at": row[12]
            }
            for row in rows
        ]



    async def get_projects(self, page: int = 1, limit: int = 20, filters: Optional[Dict[str, Any]] = None) -> Dict[
        str, Any]:
        if not self.is_authenticated:
            return {
                "success": False,
                "error": "Not authenticated",
                "projects": [],
                "page": page,
                "total": 0,
                "pages": 1
            }

        try:
            url = "/projects"
            params = {"c": "all", "page": page}

            # Здесь можно применить фильтры к URL если нужно (по категориям и т.п.)
            if filters:
                params.update(filters)

            response = await self._make_request("GET", url, params=params)

            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"Failed to get projects page: {response.status_code}",
                    "projects": [],
                    "page": page,
                    "total": 0,
                    "pages": 1
                }

            soup = BeautifulSoup(response.text, "html.parser")
            project_cards = soup.select("div.js-pjax-container div.project-card")

            all_projects = []
            for card in project_cards:
                try:
                    parsed = self._parse_project_item(card)
                    if parsed:
                        all_projects.append(parsed)
                except Exception as e:
                    logger.debug(f"⛔ Ошибка при парсинге карточки проекта: {e}")
                    continue

            total_projects = len(all_projects)
            pages = (total_projects + limit - 1) // limit

            return {
                "success": True,
                "projects": all_projects[:limit],  # ограничиваем вручную
                "page": page,
                "total": total_projects,
                "pages": pages
            }

        except Exception as e:
            logger.error(f"❌ Ошибка при получении проектов: {e}")
            return {
                "success": False,
                "error": str(e),
                "projects": [],
                "page": page,
                "total": 0,
                "pages": 1
            }


    BASE_URL = "https://kwork.ru/projects"


    BASE_URL = "https://kwork.ru/projects"

    def _parse_project_item(self, item) -> Dict[str, Any]:
        # твоя реализация осталась без изменений
        project = {}
        try:
            title_elem = item.select_one("h1.wants-card__header-title a")
            if title_elem:
                href = title_elem.get("href", "")
                project["title"] = title_elem.get_text(strip=True)
                project["url"] = "https://kwork.ru" + href
                project["id"] = href.split("/")[-1]

            summary_elem = item.select_one("div.wants-card__description-text .d-inline")
            if summary_elem:
                project["summary"] = summary_elem.get_text(strip=True)

            price_elem = item.select_one("div.wants-card__price span.rouble")
            if price_elem:
                price_wrapper = item.select_one("div.wants-card__price div.d-inline")
                if price_wrapper:
                    price_text = price_wrapper.get_text(strip=True)
                    match = re.search(r"(\d[\d\s]*)", price_text)
                    if match:
                        project["price"] = int(match.group(1).replace(" ", ""))
                    else:
                        project["price_raw"] = price_text.strip()
                else:
                    project["price"] = None  # явно указываем отсутствие



            higher_price_elem = item.select_one("div.wants-card__description-higher-price div.d-inline")
            if higher_price_elem:
                match = re.search(r"(\d[\d\s]*)", higher_price_elem.get_text(strip=True))
                if match:
                    project["price_max"] = int(match.group(1).replace(" ", ""))

            client_elem = item.select_one("a[href^='/user/']")
            if client_elem:
                project["client_name"] = client_elem.get_text(strip=True)
                project["client_profile_url"] = "https://kwork.ru" + client_elem["href"]
                project["client_id"] = client_elem["href"].split("/")[-1]

            stats_text = item.get_text()

            match_projects = re.search(r"Размещено проектов на бирже:\s*(\d+)", stats_text)
            if match_projects:
                project["client_projects"] = int(match_projects.group(1))

            match_hired = re.search(r"Нанято:\s*(\d+)%", stats_text)
            if match_hired:
                project["hired_percent"] = int(match_hired.group(1))

            time_left = re.search(r"Осталось:\s*([^\n]+?)\s*(Предложений|$)", stats_text)
            if time_left:
                project["time_left"] = time_left.group(1).strip()

            match_offers = re.search(r"Предложений:\s*(\d+)", stats_text)
            if match_offers:
                project["offers"] = int(match_offers.group(1))

            project["viewed"] = "ПРОСМОТРЕНО" in stats_text

        except Exception as e:
            project["parsing_error"] = str(e)

        return project

    async def save_projects_to_db(self, db: Database, projects: List[Dict[str, Any]]):
        new_ids = {project.get("id") for project in projects}

        existing_rows = await db.execute_many("SELECT id FROM projects")
        existing_ids = {row["id"] for row in existing_rows}

        for project in projects:
            try:
                await db.execute_insert("""
                    INSERT INTO projects (
                        id, title, description, price, price_max,
                        buyer_username, buyer_rating, projects_posted,
                        hire_rate, proposals_count, time_left, is_viewed
                    ) VALUES (
                        :id, :title, :description, :price, :price_max,
                        :buyer_username, :buyer_rating, :projects_posted,
                        :hire_rate, :proposals_count, :time_left, :is_viewed
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        description = excluded.description,
                        price = excluded.price,
                        price_max = excluded.price_max,
                        buyer_username = excluded.buyer_username,
                        buyer_rating = excluded.buyer_rating,
                        projects_posted = excluded.projects_posted,
                        hire_rate = excluded.hire_rate,
                        proposals_count = excluded.proposals_count,
                        time_left = excluded.time_left,
                        is_viewed = excluded.is_viewed
                """, {
                    "id": project.get("id"),
                    "title": project.get("title"),
                    "description": project.get("summary", ""),
                    "price": project.get("price") or 0,
                    "price_max": project.get("price_max") or 0,
                    "buyer_username": project.get("client_name", ""),
                    "buyer_rating": None,
                    "projects_posted": project.get("client_projects") or 0,
                    "hire_rate": project.get("hired_percent") or 0.0,
                    "proposals_count": project.get("offers") or 0,
                    "time_left": project.get("time_left", ""),
                    "is_viewed": int(project.get("viewed", False)),
                })
            except Exception as e:
                print(f"❌ Ошибка сохранения проекта {project.get('id')}: {e}")

        ids_to_delete = existing_ids - new_ids
        if ids_to_delete:
            placeholders = ",".join("?" * len(ids_to_delete))
            await db.execute_update(f"DELETE FROM projects WHERE id IN ({placeholders})", tuple(ids_to_delete))
            print(f"🗑 Удалено {len(ids_to_delete)} старых проектов")

    async def parse_projects(self, db, max_empty_pages: int = 2):
        """Парсит и сохраняет проекты в БД пока не закончатся"""
        options = Options()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")

        driver = webdriver.Chrome(service=Service(install()), options=options)
        all_projects = []
        seen_project_ids = set()
        empty_count = 0
        page = 1

        try:
            while True:
                url = f"{self.BASE_URL}?c=all&page={page}"
                driver.get(url)
                time.sleep(2)

                soup = BeautifulSoup(driver.page_source, "html.parser")
                project_items = soup.select("div.want-card.want-card--list")
                print(f"✅ Страница {page}: найдено {len(project_items)} проектов")

                if not project_items:
                    print(f"❌ На странице {page} нет проектов, останавливаемся.")
                    break

                new_projects = []
                for item in project_items:
                    parsed = self._parse_project_item(item)
                    if parsed['id'] not in seen_project_ids:
                        new_projects.append(parsed)
                        seen_project_ids.add(parsed['id'])

                if not new_projects:
                    empty_count += 1
                    print(f"⚠️ Страница {page} не содержит новых проектов. Пустых подряд: {empty_count}")
                    if empty_count >= max_empty_pages:
                        print("🚫 Достигнут лимит пустых страниц, останавливаемся.")
                        break
                else:
                    empty_count = 0
                    all_projects.extend(new_projects)

                page += 1

        finally:
            driver.quit()

        # 👉 Сохраняем в базу
        await self.save_projects_to_db(db, all_projects)

    # async def parse_projects(self, db, max_pages: int = 5):
    #     """Парсит и сохраняет проекты в БД"""
    #     options = Options()
    #     options.add_argument("--headless")
    #     options.add_argument("--no-sandbox")
    #     options.add_argument("--disable-dev-shm-usage")
    #
    #     driver = webdriver.Chrome(service=Service(install()), options=options)
    #     all_projects = []
    #
    #     try:
    #         for page in range(1, max_pages + 1):
    #             url = f"{self.BASE_URL}?c=all&page={page}"
    #             driver.get(url)
    #             time.sleep(2)
    #
    #             soup = BeautifulSoup(driver.page_source, "html.parser")
    #             project_items = soup.select("div.want-card.want-card--list")
    #             print(f"✅ Страница {page}: найдено {len(project_items)} проектов")
    #
    #             if not project_items:
    #                 print(f"❌ На странице {page} нет проектов, останавливаемся.")
    #                 break
    #
    #             for item in project_items:
    #                 parsed = self._parse_project_item(item)
    #                 all_projects.append(parsed)
    #
    #     finally:
    #         driver.quit()
    #
    #     # 👉 Сохраняем в базу
    #     await self.save_projects_to_db(db, all_projects)









class KworkClientManager:
    """Менеджер для управления клиентами Kwork"""
    
    def __init__(self):
        self.clients: Dict[str, KworkClient] = {}
        self.active_account: Optional[str] = None
    
    async def get_client(self, account_id: str, login: str, encrypted_password: str) -> KworkClient:
        """Получение клиента для аккаунта"""
        if account_id not in self.clients:
            self.clients[account_id] = KworkClient(account_id, login, encrypted_password)
        
        return self.clients[account_id]
    
    async def set_active_account(self, account_id: str):
        """Установка активного аккаунта"""
        self.active_account = account_id

    async def get_active_client(self) -> Optional[KworkClient]:
        """Получение активного клиента"""
        if self.active_account:
            return self.clients.get(self.active_account)
        return None

    async def close_all_clients(self):
        """Закрытие всех клиентов"""
        for client in self.clients.values():
            await client.close()
        self.clients.clear()

# Глобальный менеджер клиентов
client_manager = KworkClientManager()