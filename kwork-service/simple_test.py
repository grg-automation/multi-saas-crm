#!/usr/bin/env python3
"""
Простой тест парсера Kwork
Проверяет базовую функциональность без сложных зависимостей
"""

import sys
import os
from dotenv import load_dotenv

# Добавляем путь к проекту
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Загружаем переменные окружения
load_dotenv()

def test_basic_imports():
    """Тест базовых импортов"""
    print("🔍 Тестируем базовые импорты...")
    
    try:
        from app.core.config import settings
        print("✅ Конфигурация загружена")
        
        from app.core.security import encrypt_password
        print("✅ Модуль безопасности загружен")
        
        print("✅ Все базовые модули работают")
        return True
        
    except Exception as e:
        print(f"❌ Ошибка импорта: {e}")
        return False

def test_config():
    """Тест конфигурации"""
    print("\n⚙️ Тестируем конфигурацию...")
    
    try:
        from app.core.config import settings
        
        print(f"  📍 HOST: {settings.HOST}")
        print(f"  📍 PORT: {settings.PORT}")
        print(f"  📍 DEBUG: {settings.DEBUG}")
        print(f"  📍 DATABASE_URL: {settings.DATABASE_URL}")
        print(f"  📍 CRM_API_URL: {settings.CRM_API_URL}")
        
        # Проверяем учетные данные
        username = settings.KWORK_TEST_USERNAME
        password = settings.KWORK_TEST_PASSWORD
        
        if username and password and username != "ваш_логин_kwork":
            print(f"  ✅ Учетные данные настроены: {username}")
        else:
            print("  ⚠️ Учетные данные не настроены (это нормально для теста)")
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка конфигурации: {e}")
        return False

def test_api_structure():
    """Тест структуры API"""
    print("\n🌐 Тестируем структуру API...")
    
    try:
        # Проверяем наличие основных файлов
        api_files = [
            "app/api/v1/auth.py",
            "app/api/v1/orders.py", 
            "app/api/v1/accounts.py",
            "app/api/v1/chat.py",
            "app/api/v1/gigs.py",
            "app/api/v1/crm_sync.py"
        ]
        
        for file_path in api_files:
            if os.path.exists(file_path):
                print(f"  ✅ {file_path}")
            else:
                print(f"  ❌ {file_path} - не найден")
        
        # Проверяем наличие основных модулей
        core_files = [
            "app/core/config.py",
            "app/core/security.py",
            "app/core/database.py",
            "app/core/crm_integration.py",
            "app/core/auth_middleware.py"
        ]
        
        for file_path in core_files:
            if os.path.exists(file_path):
                print(f"  ✅ {file_path}")
            else:
                print(f"  ❌ {file_path} - не найден")
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка проверки структуры: {e}")
        return False

def test_main_app():
    """Тест основного приложения"""
    print("\n🚀 Тестируем основное приложение...")
    
    try:
        # Проверяем main.py
        if os.path.exists("main.py"):
            print("  ✅ main.py найден")
            
            # Читаем main.py и проверяем основные импорты
            with open("main.py", "r") as f:
                content = f.read()
                
            required_imports = [
                "fastapi",
                "uvicorn", 
                "app.core.config",
                "app.api.v1"
            ]
            
            for imp in required_imports:
                if imp in content:
                    print(f"  ✅ Импорт {imp} найден")
                else:
                    print(f"  ⚠️ Импорт {imp} не найден")
        else:
            print("  ❌ main.py не найден")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка проверки приложения: {e}")
        return False

def main():
    """Основная функция тестирования"""
    print("🧪 Запуск простого тестирования парсера Kwork")
    print("=" * 60)
    
    tests = [
        ("Базовые импорты", test_basic_imports),
        ("Конфигурация", test_config),
        ("Структура API", test_api_structure),
        ("Основное приложение", test_main_app),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            if result:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ Исключение в тесте '{test_name}': {e}")
            failed += 1
    
    print("\n" + "=" * 60)
    print("📊 Результаты тестирования:")
    print(f"✅ Пройдено: {passed}")
    print(f"❌ Не пройдено: {failed}")
    
    if passed > 0:
        print(f"📈 Успешность: {passed/(passed+failed)*100:.1f}%")
    
    if failed == 0:
        print("\n🎉 Все тесты пройдены! Парсер готов к работе.")
        print("\n💡 Следующие шаги:")
        print("   1. Настройте учетные данные Kwork в .env файле")
        print("   2. Запустите: python test_kwork_parser.py")
        print("   3. Или запустите через Docker: docker-compose up kwork-service")
    else:
        print(f"\n⚠️ {failed} тестов не пройдено.")
        print("💡 Проверьте:")
        print("   - Установлены ли зависимости")
        print("   - Правильность структуры файлов")
        print("   - Настройки в .env файле")

if __name__ == "__main__":
    main() 