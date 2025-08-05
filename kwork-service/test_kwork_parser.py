#!/usr/bin/env python3
"""
Тестирование парсера Kwork
Для тестирования создайте .env файл с KWORK_TEST_USERNAME и KWORK_TEST_PASSWORD

Пример .env файла:
KWORK_TEST_USERNAME=your_email@example.com
KWORK_TEST_PASSWORD=your_password
"""

import asyncio
import sys
import os
from dotenv import load_dotenv

# Добавляем путь к проекту
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.kwork_client import KworkClient
from app.core.security import encrypt_password
from app.core.config import settings
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Загружаем переменные окружения
load_dotenv()

async def test_kwork_authentication():
    """Тест аутентификации в Kwork"""
    print("🔐 Тестируем аутентификацию в Kwork...")
    
    # Проверяем наличие учетных данных
    username = settings.KWORK_TEST_USERNAME
    password = settings.KWORK_TEST_PASSWORD
    
    if not username or not password:
        print("❌ Ошибка: не заданы KWORK_TEST_USERNAME и KWORK_TEST_PASSWORD в .env файле")
        print("Создайте .env файл на основе env.template и заполните учетные данные")
        return False
    
    try:
        encrypted_password = encrypt_password(password)
        
        async with KworkClient("test_account", username, encrypted_password) as client:
            # Используем новый метод Playwright аутентификации
            success = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
            
            if success:
                print(f"✅ Аутентификация успешна для пользователя: {username}")
                return True
            else:
                print(f"❌ Не удалось аутентифицироваться для пользователя: {username}")
                return False
                
    except Exception as e:
        print(f"❌ Ошибка аутентификации: {e}")
        return False

async def test_orders_parsing():
    """Тест парсинга заказов"""
    print("\n📋 Тестируем парсинг заказов...")
    
    username = settings.KWORK_TEST_USERNAME
    password = settings.KWORK_TEST_PASSWORD
    
    if not username or not password:
        print("❌ Пропущен: отсутствуют учетные данные")
        return False
    
    try:
        encrypted_password = encrypt_password(password)
        
        async with KworkClient("test_account", username, encrypted_password) as client:
            # Сначала аутентифицируемся
            auth_success = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
            if not auth_success:
                print("❌ Не удалось аутентифицироваться")
                return False
            
            # Получаем заказы
            orders_result = await client.get_orders(page=1, limit=10)
            
            if orders_result["success"]:
                orders = orders_result["data"]
                print(f"✅ Получено заказов: {len(orders)}")
                
                # Показываем первые несколько заказов
                for i, order in enumerate(orders[:3]):
                    print(f"  {i+1}. {order.get('title', 'Без названия')} - {order.get('price', 'N/A')} руб.")
                
                return True
            else:
                print(f"❌ Ошибка получения заказов: {orders_result.get('error', 'Неизвестная ошибка')}")
                return False
                
    except Exception as e:
        print(f"❌ Ошибка парсинга заказов: {e}")
        return False

async def test_gigs_parsing():
    """Тест парсинга кворков"""
    print("\n🛠️ Тестируем парсинг кворков...")
    
    username = settings.KWORK_TEST_USERNAME
    password = settings.KWORK_TEST_PASSWORD
    
    if not username or not password:
        print("❌ Пропущен: отсутствуют учетные данные")
        return False
    
    try:
        encrypted_password = encrypt_password(password)
        
        async with KworkClient("test_account", username, encrypted_password) as client:
            # Сначала аутентифицируемся
            auth_success = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
            if not auth_success:
                print("❌ Не удалось аутентифицироваться")
                return False
            
            # Получаем кворки
            gigs_result = await client.get_my_gigs()
            
            if gigs_result["success"]:
                gigs = gigs_result["data"]
                print(f"✅ Получено кворков: {len(gigs)}")
                
                # Показываем статистику
                active_gigs = [g for g in gigs if g.get('status') == 'active']
                total_views = sum(g.get('views', 0) for g in gigs)
                total_orders = sum(g.get('orders_count', 0) for g in gigs)
                
                print(f"  📊 Активных: {len(active_gigs)}")
                print(f"  👀 Всего просмотров: {total_views}")
                print(f"  📦 Всего заказов: {total_orders}")
                
                return True
            else:
                print(f"❌ Ошибка получения кворков: {gigs_result.get('error', 'Неизвестная ошибка')}")
                return False
                
    except Exception as e:
        print(f"❌ Ошибка парсинга кворков: {e}")
        return False

async def test_account_info():
    """Тест получения информации об аккаунте"""
    print("\n👤 Тестируем получение информации об аккаунте...")
    
    username = settings.KWORK_TEST_USERNAME
    password = settings.KWORK_TEST_PASSWORD
    
    if not username or not password:
        print("❌ Пропущен: отсутствуют учетные данные")
        return False
    
    try:
        encrypted_password = encrypt_password(password)
        
        async with KworkClient("test_account", username, encrypted_password) as client:
            # Сначала аутентифицируемся
            auth_success = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
            if not auth_success:
                print("❌ Не удалось аутентифицироваться")
                return False
            
            # Получаем информацию об аккаунте
            account_info = await client.get_account_info()
            
            print(f"✅ Информация об аккаунте:")
            print(f"  📛 Имя: {account_info.get('display_name', 'N/A')}")
            print(f"  👤 Username: {account_info.get('username', 'N/A')}")
            print(f"  ⭐ Рейтинг: {account_info.get('rating', 'N/A')}")
            print(f"  📝 Отзывов: {account_info.get('reviews_count', 'N/A')}")
            print(f"  🏆 Уровень: {account_info.get('level', 'N/A')}")
            
            return True
                
    except Exception as e:
        print(f"❌ Ошибка получения информации об аккаунте: {e}")
        return False

async def main():
    """Основная функция тестирования"""
    print("🚀 Запуск тестирования парсера Kwork")
    print("=" * 50)
    
    # Проверяем настройки
    if not settings.KWORK_TEST_USERNAME or not settings.KWORK_TEST_PASSWORD:
        print("⚠️ ВНИМАНИЕ: Для полного тестирования необходимо создать .env файл")
        print("📝 Скопируйте env.template в .env и заполните KWORK_TEST_USERNAME и KWORK_TEST_PASSWORD")
        print("🔍 Пример:")
        print("   KWORK_TEST_USERNAME=ваш_логин")
        print("   KWORK_TEST_PASSWORD=ваш_пароль")
        print("\n🛑 Тестирование остановлено.")
        return
    
    tests = [
        ("Аутентификация", test_kwork_authentication),
        ("Парсинг заказов", test_orders_parsing),
        ("Парсинг кворков", test_gigs_parsing),
        ("Информация об аккаунте", test_account_info),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            result = await test_func()
            if result:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ Исключение в тесте '{test_name}': {e}")
            failed += 1
    
    print("\n" + "=" * 50)
    print("📊 Результаты тестирования:")
    print(f"✅ Пройдено: {passed}")
    print(f"❌ Не пройдено: {failed}")
    
    if passed > 0:
        print(f"📈 Успешность: {passed/(passed+failed)*100:.1f}%")
    
    if failed == 0:
        print("\n🎉 Все тесты пройдены! Парсер Kwork работает корректно.")
    else:
        print(f"\n⚠️ {failed} тестов не пройдено.")
        print("💡 Возможные причины:")
        print("   - Неверные учетные данные")
        print("   - Изменения в структуре сайта Kwork")
        print("   - Проблемы с интернет-соединением")
        print("   - Блокировка IP или rate limiting")

if __name__ == "__main__":
    asyncio.run(main()) 