#!/usr/bin/env python3
"""
Скрипт для тестирования API Kwork Hub
Проверяет основные функции парсера Kwork
"""

import requests
import json
import time
import os
from typing import Dict, Any
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

class KworkHubTester:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None
        self.user_id = None
        
    def test_connection(self) -> bool:
        """Тест подключения к API"""
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                print("✅ API доступен")
                return True
            else:
                print(f"❌ API недоступен: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Ошибка подключения: {e}")
            return False
    
    def test_health_check(self) -> bool:
        """Тест health check"""
        try:
            response = self.session.get(f"{self.base_url}/health")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Health check: {data['status']}")
                return True
            else:
                print(f"❌ Health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Health check error: {e}")
            return False
    
    def test_docs(self) -> bool:
        """Тест доступности документации"""
        try:
            response = self.session.get(f"{self.base_url}/docs")
            if response.status_code == 200:
                print("✅ Swagger docs доступны")
                return True
            else:
                print(f"❌ Swagger docs недоступны: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Docs error: {e}")
            return False
    
    def test_forbidden_routes(self) -> bool:
        """Тест блокировки запрещенных маршрутов"""
        forbidden_routes = ["/settings", "/payment", "/finance", "/balance"]
        
        print("\n🔒 Проверка блокировки запрещенных маршрутов:")
        all_blocked = True
        
        for route in forbidden_routes:
            try:
                response = self.session.get(f"{self.base_url}{route}")
                if response.status_code == 403:
                    print(f"✅ {route} - заблокирован")
                else:
                    print(f"❌ {route} - НЕ заблокирован ({response.status_code})")
                    all_blocked = False
            except Exception as e:
                print(f"❌ Ошибка при проверке {route}: {e}")
                all_blocked = False
        
        return all_blocked
    
    def register_test_user(self) -> bool:
        """Регистрация тестового пользователя"""
        user_data = {
            "username": f"testuser_{int(time.time())}",
            "email": f"test_{int(time.time())}@example.com",
            "password": "testpassword123"
        }
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/v1/auth/register",
                json=user_data
            )
            
            if response.status_code == 200:
                print("✅ Пользователь зарегистрирован")
                self.test_user = user_data
                return True
            else:
                print(f"❌ Ошибка регистрации: {response.status_code}")
                print(f"Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Ошибка регистрации: {e}")
            return False
    
    def login_test_user(self) -> bool:
        """Вход тестового пользователя"""
        if not hasattr(self, 'test_user'):
            print("❌ Нет тестового пользователя для входа")
            return False
        
        login_data = {
            "username": self.test_user["username"],
            "password": self.test_user["password"]
        }
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/v1/auth/login",
                json=login_data
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data["access_token"]
                self.session.headers.update({
                    "Authorization": f"Bearer {self.token}"
                })
                print("✅ Успешный вход в систему")
                return True
            else:
                print(f"❌ Ошибка входа: {response.status_code}")
                print(f"Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Ошибка входа: {e}")
            return False
    
    def test_protected_endpoint(self) -> bool:
        """Тест защищенного endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/api/v1/auth/me")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Защищенный endpoint работает. Пользователь: {data['username']}")
                return True
            else:
                print(f"❌ Защищенный endpoint не работает: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Ошибка защищенного endpoint: {e}")
            return False
    
    def test_add_kwork_account(self) -> bool:
        """Тест добавления Kwork аккаунта"""
        account_data = {
            "login": "test_kwork_user",
            "password": "test_kwork_password",
            "account_name": "Test Kwork Account"
        }
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/v1/accounts",
                json=account_data
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Kwork аккаунт добавлен: {data['account_name']}")
                self.account_id = data['id']
                return True
            else:
                print(f"❌ Ошибка добавления аккаунта: {response.status_code}")
                print(f"Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Ошибка добавления аккаунта: {e}")
            return False
    
    def test_get_accounts(self) -> bool:
        """Тест получения списка аккаунтов"""
        try:
            response = self.session.get(f"{self.base_url}/api/v1/accounts")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Получен список аккаунтов: {len(data)} аккаунтов")
                return True
            else:
                print(f"❌ Ошибка получения аккаунтов: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Ошибка получения аккаунтов: {e}")
            return False
    
    def test_rate_limiting(self) -> bool:
        """Тест rate limiting"""
        print("\n⏱️ Проверка rate limiting (отправка 5 быстрых запросов):")
        
        success_count = 0
        blocked_count = 0
        
        for i in range(5):
            try:
                response = self.session.get(f"{self.base_url}/health")
                if response.status_code == 200:
                    success_count += 1
                    print(f"✅ Запрос {i+1}: успешно")
                elif response.status_code == 429:
                    blocked_count += 1
                    print(f"🚫 Запрос {i+1}: заблокирован rate limiting")
                else:
                    print(f"❓ Запрос {i+1}: неожиданный код {response.status_code}")
            except Exception as e:
                print(f"❌ Запрос {i+1}: ошибка {e}")
            
            time.sleep(0.1)  # Небольшая задержка
        
        print(f"Результат: {success_count} успешных, {blocked_count} заблокированных")
        return success_count > 0  # Хотя бы один запрос должен пройти
    
    def test_file_upload(self) -> bool:
        """Тест загрузки файла"""
        try:
            # Создаем тестовый файл
            test_content = b"This is a test file content"
            files = {
                'file': ('test.txt', test_content, 'text/plain')
            }
            data = {
                'category': 'temp'
            }
            
            response = self.session.post(
                f"{self.base_url}/api/v1/files/upload",
                files=files,
                data=data
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Файл загружен: {data['filename']}")
                self.file_id = data['id']
                return True
            else:
                print(f"❌ Ошибка загрузки файла: {response.status_code}")
                print(f"Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Ошибка загрузки файла: {e}")
            return False
    
    def run_all_tests(self):
        """Запуск всех тестов"""
        print("🚀 Запуск тестов Kwork Hub API\n")
        
        tests = [
            ("Подключение к API", self.test_connection),
            ("Health Check", self.test_health_check),
            ("Документация", self.test_docs),
            ("Запрещенные маршруты", self.test_forbidden_routes),
            ("Регистрация пользователя", self.register_test_user),
            ("Вход в систему", self.login_test_user),
            ("Защищенный endpoint", self.test_protected_endpoint),
            ("Добавление Kwork аккаунта", self.test_add_kwork_account),
            ("Список аккаунтов", self.test_get_accounts),
            ("Rate Limiting", self.test_rate_limiting),
            ("Загрузка файла", self.test_file_upload),
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            print(f"\n🔍 {test_name}:")
            try:
                if test_func():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ Исключение в тесте: {e}")
                failed += 1
        
        print(f"\n📊 Результаты тестирования:")
        print(f"✅ Пройдено: {passed}")
        print(f"❌ Не пройдено: {failed}")
        print(f"📈 Успешность: {passed/(passed+failed)*100:.1f}%")
        
        if failed == 0:
            print("\n🎉 Все тесты пройдены! API работает корректно.")
        else:
            print(f"\n⚠️ {failed} тестов не пройдено. Проверьте логи и конфигурацию.")

if __name__ == "__main__":
    tester = KworkHubTester()
    tester.run_all_tests()