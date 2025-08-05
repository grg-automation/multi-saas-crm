"""
Аутентификация в Kwork через Playwright с сохранением куки
"""
import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, Optional, Any
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from datetime import datetime, timedelta

from ..core.config import settings

logger = logging.getLogger(__name__)

class KworkPlaywrightAuth:
    """
    Аутентификация в Kwork через браузер с сохранением сессии
    """
    
    def __init__(self, login: str, password: str, cookies_file: Optional[str] = None):
        self.login = login
        self.password = password
        self.cookies_file = cookies_file or f"cookies_{login.replace('@', '_').replace('.', '_')}.json"
        self.cookies_path = Path(f"./uploads/cookies/{self.cookies_file}")
        self.cookies_path.parent.mkdir(parents=True, exist_ok=True)
        
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def close(self):
        """Закрытие браузера"""
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
    
    async def load_cookies(self) -> bool:
        """Загрузка сохраненных куки"""
        try:
            if self.cookies_path.exists():
                with open(self.cookies_path, 'r', encoding='utf-8') as f:
                    cookies_data = json.load(f)
                
                # Проверяем срок действия куки
                if 'expires_at' in cookies_data:
                    expires_at = datetime.fromisoformat(cookies_data['expires_at'])
                    if datetime.now() > expires_at:
                        logger.info("Куки истекли, требуется новая аутентификация")
                        return False
                
                # Добавляем куки в контекст
                if self.context and 'cookies' in cookies_data:
                    await self.context.add_cookies(cookies_data['cookies'])
                    logger.info(f"Загружены куки из {self.cookies_path}")
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"Ошибка загрузки куки: {e}")
            return False
    
    async def save_cookies(self):
        """Сохранение куки в файл"""
        try:
            if not self.context:
                return
            
            cookies = await self.context.cookies()
            
            # Сохраняем куки с временем истечения
            cookies_data = {
                'cookies': cookies,
                'expires_at': (datetime.now() + timedelta(days=7)).isoformat(),
                'login': self.login,
                'saved_at': datetime.now().isoformat()
            }
            
            with open(self.cookies_path, 'w', encoding='utf-8') as f:
                json.dump(cookies_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Куки сохранены в {self.cookies_path}")
            
        except Exception as e:
            logger.error(f"Ошибка сохранения куки: {e}")
    
    async def init_browser(self, headless: bool = True) -> bool:
        """Инициализация браузера"""
        try:
            playwright = await async_playwright().start()
            
            # Запускаем браузер
            self.browser = await playwright.chromium.launch(
                headless=headless,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-default-apps',
                    '--disable-features=VizDisplayCompositor'
                ]
            )
            
            # Создаем контекст с настройками
            self.context = await self.browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport={'width': 1920, 'height': 1080},
                locale='ru-RU',
                timezone_id='Europe/Moscow'
            )
            
            # Создаем страницу
            self.page = await self.context.new_page()
            
            return True
            
        except Exception as e:
            logger.error(f"Ошибка инициализации браузера: {e}")
            return False

    # async def get_cookies_raw(self) -> list[dict[str, Any]]:
    #     """
    #     Получение куки в сыром формате (для Selenium)
    #     """
    #     if self.context:
    #         return await self.context.cookies()
    #
    #     if self.cookies_path.exists():
    #         with open(self.cookies_path, 'r', encoding='utf-8') as f:
    #             cookies_data = json.load(f)
    #         return cookies_data.get('cookies', [])
    #
    #     return []
    async def authenticate_with_browser(self, show_browser: bool = False) -> bool:
        """
        Аутентификация через браузер с визуальным интерфейсом
        """
        try:
            logger.info("Запуск аутентификации через браузер...")
            
            # Инициализируем браузер
            if not await self.init_browser(headless=not show_browser):
                return False
            
            # Пробуем загрузить существующие куки
            cookies_loaded = await self.load_cookies()
            if cookies_loaded:
                # Проверяем валидность сессии
                await self.page.goto('https://kwork.ru/profile')
                await asyncio.sleep(2)
                
                current_url = self.page.url
                if '/login' not in current_url and '/profile' in current_url:
                    logger.info("Аутентификация по сохраненным куки успешна")
                    return True
                else:
                    logger.info("Сохраненные куки недействительны, выполняется новая аутентификация")
            
            # Переходим на страницу логина
            logger.info("Переход на страницу логина...")
            await self.page.goto('https://kwork.ru/login')
            await asyncio.sleep(3)
            
            if show_browser:
                print("\n" + "="*60)
                print("🌐 БРАУЗЕР ОТКРЫТ ДЛЯ РУЧНОЙ АУТЕНТИФИКАЦИИ")
                print("="*60)
                print("1. В открытом браузере введите данные для входа:")
                print(f"   📧 Email: {self.login}")
                print(f"   🔑 Пароль: {self.password}")
                print("2. Пройдите капчу если потребуется")
                print("3. Нажмите Enter в этом окне после входа в аккаунт")
                print("="*60)
                
                # Ждем ручного ввода
                input("⏳ Нажмите Enter после успешного входа в аккаунт...")
                
            else:
                # Автоматический ввод данных
                logger.info("Поиск полей для ввода...")
                
                # Ждем загрузки формы
                await self.page.wait_for_load_state('networkidle')
                await asyncio.sleep(2)
                
                # Ищем поля ввода различными способами
                email_selectors = [
                    'input[type="email"]',
                    'input[name="login"]',
                    'input[name="email"]',
                    'input[placeholder*="email"]',
                    'input[placeholder*="логин"]',
                    '#login',
                    '#email'
                ]
                
                password_selectors = [
                    'input[type="password"]',
                    'input[name="password"]',
                    '#password'
                ]
                
                # Находим поле email/логин
                email_field = None
                for selector in email_selectors:
                    try:
                        email_field = await self.page.wait_for_selector(selector, timeout=5000)
                        if email_field:
                            logger.info(f"Найдено поле email: {selector}")
                            break
                    except:
                        continue
                
                if not email_field:
                    logger.error("Не удалось найти поле для ввода email/логина")
                    return False
                
                # Находим поле пароля
                password_field = None
                for selector in password_selectors:
                    try:
                        password_field = await self.page.wait_for_selector(selector, timeout=5000)
                        if password_field:
                            logger.info(f"Найдено поле пароля: {selector}")
                            break
                    except:
                        continue
                
                if not password_field:
                    logger.error("Не удалось найти поле для ввода пароля")
                    return False
                
                # Вводим данные
                logger.info("Ввод логина...")
                await email_field.fill(self.login)
                await asyncio.sleep(1)
                
                logger.info("Ввод пароля...")
                await password_field.fill(self.password)
                await asyncio.sleep(1)
                
                # Ищем и нажимаем кнопку входа
                submit_selectors = [
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'button:has-text("Войти")',
                    'button:has-text("Вход")',
                    'button:has-text("Логин")',
                    '.login-button',
                    '#login-button'
                ]
                
                submit_button = None
                for selector in submit_selectors:
                    try:
                        submit_button = await self.page.wait_for_selector(selector, timeout=3000)
                        if submit_button:
                            logger.info(f"Найдена кнопка входа: {selector}")
                            break
                    except:
                        continue
                
                if submit_button:
                    logger.info("Нажатие кнопки входа...")
                    await submit_button.click()
                else:
                    # Пробуем нажать Enter
                    logger.info("Кнопка не найдена, нажимаем Enter...")
                    await password_field.press('Enter')
                
                # Ждем перенаправления
                await asyncio.sleep(5)
            
            # Проверяем успешность входа
            current_url = self.page.url
            logger.info(f"Текущий URL после попытки входа: {current_url}")
            
            # Проверяем, что мы не на странице логина
            if '/login' in current_url:
                logger.error("Остались на странице логина - аутентификация не удалась")
                return False
            
            # Дополнительная проверка - пробуем зайти в профиль
            await self.page.goto('https://kwork.ru/profile')
            await asyncio.sleep(2)
            
            final_url = self.page.url
            if '/login' in final_url:
                logger.error("Перенаправлен на логин при попытке зайти в профиль")
                return False
            
            logger.info("✅ Аутентификация успешна!")
            
            # Сохраняем куки
            await self.save_cookies()
            
            return True
            
        except Exception as e:
            logger.error(f"Ошибка аутентификации через браузер: {e}")
            return False
    
    async def get_cookies_for_httpx(self) -> Dict[str, str]:
        """
        Получение куки в формате для httpx
        """
        try:
            if self.context:
                cookies = await self.context.cookies()
                return {cookie['name']: cookie['value'] for cookie in cookies}
            
            # Если браузер не запущен, пробуем загрузить из файла
            if self.cookies_path.exists():
                with open(self.cookies_path, 'r', encoding='utf-8') as f:
                    cookies_data = json.load(f)
                
                if 'cookies' in cookies_data:
                    return {cookie['name']: cookie['value'] for cookie in cookies_data['cookies']}
            
            return {}
            
        except Exception as e:
            logger.error(f"Ошибка получения куки: {e}")
            return {}

    def get_cookies_for_selenium(self) -> list[dict[str, Any]]:
        """
        Получение куки в формате для Selenium
        """
        if not self.cookies_path.exists():
            return []

        with open(self.cookies_path, 'r', encoding='utf-8') as f:
            cookies_data = json.load(f)

        raw_cookies = cookies_data.get('cookies', [])
        selenium_cookies = []

        for cookie in raw_cookies:
            selenium_cookie = {
                "name": cookie["name"],
                "value": cookie["value"],
                "domain": cookie.get("domain", "kwork.ru").lstrip("."),  # без точки
                "path": cookie.get("path", "/"),
                "secure": cookie.get("secure", False),
                "httpOnly": cookie.get("httpOnly", False),
            }
            if "expires" in cookie:
                selenium_cookie["expiry"] = cookie["expires"]
            selenium_cookies.append(selenium_cookie)

        return selenium_cookies

    async def test_authentication(self) -> bool:
        """
        Тест аутентификации - проверка доступа к защищенным страницам
        """
        try:
            if not self.page:
                if not await self.init_browser():
                    return False
                await self.load_cookies()
            
            # Тестируем доступ к профилю
            await self.page.goto('https://kwork.ru/profile')
            await asyncio.sleep(2)
            
            current_url = self.page.url
            return '/login' not in current_url and '/profile' in current_url
            
        except Exception as e:
            logger.error(f"Ошибка тестирования аутентификации: {e}")
            return False


async def authenticate_kwork_account(login: str, password: str, 
                                   show_browser: bool = False,
                                   force_new_auth: bool = False) -> Optional[Dict[str, str]]:
    """
    Удобная функция для аутентификации в Kwork
    
    Args:
        login: Email для входа
        password: Пароль
        show_browser: Показать браузер для ручного ввода
        force_new_auth: Принудительная новая аутентификация (игнорировать сохраненные куки)
        
    Returns:
        Словарь с куки для использования в httpx или None при ошибке
    """
    async with KworkPlaywrightAuth(login, password) as auth:
        if force_new_auth:
            # Удаляем старые куки
            if auth.cookies_path.exists():
                auth.cookies_path.unlink()
        
        success = await auth.authenticate_with_browser(show_browser=show_browser)
        
        if success:
            cookies = await auth.get_cookies_for_httpx()
            logger.info(f"Получено {len(cookies)} куки для дальнейшего использования")
            return cookies
        else:
            logger.error("Аутентификация не удалась")
            return None

