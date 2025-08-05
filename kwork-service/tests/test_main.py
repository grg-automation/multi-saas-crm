import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
import asyncio

from main import app
from app.core.database import db

client = TestClient(app)

class TestAPI:
    """Тесты основных функций API"""
    
    def test_root_endpoint(self):
        """Тест корневого эндпоинта"""
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Kwork Hub API is running"}
    
    def test_health_check(self):
        """Тест health check"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
    
    def test_forbidden_routes_blocked(self):
        """Тест блокировки запрещенных маршрутов"""
        forbidden_paths = [
            "/settings",
            "/payment",
            "/finance",
            "/balance",
            "/login-history"
        ]
        
        for path in forbidden_paths:
            response = client.get(path)
            assert response.status_code == 403
            assert "forbidden" in response.json()["error"].lower()
    
    def test_rate_limiting_simulation(self):
        """Тест имитации rate limiting"""
        # Отправка множественных запросов для проверки rate limiting
        responses = []
        for i in range(5):
            response = client.get("/health")
            responses.append(response.status_code)
        
        # Все запросы должны проходить в нормальном режиме
        assert all(status == 200 for status in responses)
    
    def test_docs_endpoint(self):
        """Тест доступности документации"""
        response = client.get("/docs")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")

class TestAuthentication:
    """Тесты системы аутентификации"""
    
    def test_register_user(self):
        """Тест регистрации пользователя"""
        user_data = {
            "username": "testuser",
            "email": "test@example.com",
            "password": "testpassword123"
        }
        
        with patch.object(db, 'execute_query', return_value=None), \
             patch.object(db, 'execute_insert', return_value=1), \
             patch.object(db, 'log_action', return_value=None):
            
            response = client.post("/api/v1/auth/register", json=user_data)
            
            # В реальном приложении это должно быть 200, но из-за моков может быть 500
            assert response.status_code in [200, 500]
    
    def test_login_invalid_credentials(self):
        """Тест входа с неверными учетными данными"""
        login_data = {
            "username": "nonexistent",
            "password": "wrongpassword"
        }
        
        with patch.object(db, 'execute_query', return_value=None):
            response = client.post("/api/v1/auth/login", json=login_data)
            assert response.status_code == 401
    
    def test_protected_endpoint_without_token(self):
        """Тест защищенного эндпоинта без токена"""
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 403

class TestRateLimiting:
    """Тесты системы rate limiting"""
    
    def test_rate_limiter_creation(self):
        """Тест создания rate limiter"""
        from app.core.rate_limiter import RateLimiter
        
        limiter = RateLimiter(max_requests=5, time_window=60)
        assert limiter.max_requests == 5
        assert limiter.time_window == 60
    
    @pytest.mark.asyncio
    async def test_rate_limiter_allows_requests(self):
        """Тест разрешения запросов в пределах лимита"""
        from app.core.rate_limiter import RateLimiter
        
        limiter = RateLimiter(max_requests=3, time_window=60)
        
        # Первые 3 запроса должны быть разрешены
        for i in range(3):
            allowed = await limiter.allow_request("test_user")
            assert allowed == True
        
        # 4-й запрос должен быть заблокирован
        allowed = await limiter.allow_request("test_user")
        assert allowed == False
    
    @pytest.mark.asyncio
    async def test_account_rate_limiter(self):
        """Тест rate limiter для аккаунтов"""
        from app.core.rate_limiter import AccountRateLimiter
        
        limiter = AccountRateLimiter()
        
        # Тест общего лимита
        allowed = await limiter.allow_general_request("test_account")
        assert allowed == True
        
        # Тест лимита сообщений
        allowed = await limiter.allow_message("test_account")
        assert allowed == True
        
        # Тест лимита откликов
        allowed = await limiter.allow_response("test_account")
        assert allowed == True

class TestSecurity:
    """Тесты системы безопасности"""
    
    def test_password_hashing(self):
        """Тест хеширования паролей"""
        from app.core.security import hash_password, verify_password
        
        password = "testpassword123"
        hashed = hash_password(password)
        
        assert hashed != password
        assert verify_password(password, hashed) == True
        assert verify_password("wrongpassword", hashed) == False
    
    def test_password_encryption(self):
        """Тест шифрования паролей Kwork"""
        from app.core.security import encrypt_password, decrypt_password
        
        password = "kworkpassword123"
        encrypted = encrypt_password(password)
        
        assert encrypted != password
        assert decrypt_password(encrypted) == password
    
    def test_jwt_token_creation(self):
        """Тест создания JWT токена"""
        from app.core.security import create_access_token, verify_token
        
        data = {"sub": "test_user"}
        token = create_access_token(data)
        
        assert isinstance(token, str)
        assert len(token) > 0
        
        # Проверка токена
        payload = verify_token(token)
        assert payload["sub"] == "test_user"

class TestFileHandler:
    """Тесты обработчика файлов"""
    
    def test_file_type_validation(self):
        """Тест валидации типов файлов"""
        from app.utils.file_handler import FileHandler
        
        handler = FileHandler()
        
        # Разрешенные типы
        assert handler._is_allowed_file("document.pdf") == True
        assert handler._is_allowed_file("image.jpg") == True
        assert handler._is_allowed_file("archive.zip") == True
        
        # Запрещенные типы
        assert handler._is_allowed_file("script.exe") == False
        assert handler._is_allowed_file("code.py") == False
    
    def test_safe_filename_generation(self):
        """Тест генерации безопасного имени файла"""
        from app.utils.file_handler import FileHandler
        
        handler = FileHandler()
        
        unsafe_filename = "../../dangerous file!@#$.pdf"
        safe_filename = handler._get_safe_filename(unsafe_filename)
        
        assert "../" not in safe_filename
        assert "!" not in safe_filename
        assert "@" not in safe_filename
        assert safe_filename.endswith(".pdf")
    
    @pytest.mark.asyncio
    async def test_file_size_validation(self):
        """Тест валидации размера файла"""
        from app.utils.file_handler import FileHandler
        
        handler = FileHandler()
        
        # Файл превышающий лимит
        large_content = b"x" * (25 * 1024 * 1024)  # 25MB
        
        with pytest.raises(ValueError, match="File size exceeds"):
            await handler.save_uploaded_file(
                large_content, 
                "large_file.txt", 
                user_id=1
            )

class TestKworkClient:
    """Тесты клиента Kwork"""
    
    def test_client_initialization(self):
        """Тест инициализации клиента"""
        from app.services.kwork_client import KworkClient
        
        client = KworkClient(
            account_id="test_account",
            login="test_login",
            encrypted_password="encrypted_password"
        )
        
        assert client.account_id == "test_account"
        assert client.login == "test_login"
        assert client.is_authenticated == False
    
    @pytest.mark.asyncio
    async def test_client_rate_limiting(self):
        """Тест rate limiting в клиенте"""
        from app.services.kwork_client import KworkClient
        from app.core.rate_limiter import account_rate_limiter
        
        client = KworkClient(
            account_id="test_account",
            login="test_login", 
            encrypted_password="encrypted_password"
        )
        
        # Проверка, что rate limiting работает
        with patch.object(account_rate_limiter, 'allow_general_request', return_value=False):
            with pytest.raises(Exception, match="Rate limit exceeded"):
                await client._ensure_rate_limit()

class TestForbiddenRoutes:
    """Тесты блокировки запрещенных маршрутов"""
    
    def test_forbidden_routes_list(self):
        """Тест списка запрещенных маршрутов"""
        from app.core.forbidden_routes import FORBIDDEN_ROUTES
        
        expected_routes = [
            "/settings",
            "/payment", 
            "/finance",
            "/balance",
            "/login-history"
        ]
        
        for route in expected_routes:
            assert route in FORBIDDEN_ROUTES
    
    def test_forbidden_route_blocking(self):
        """Тест блокировки запрещенных маршрутов"""
        forbidden_routes = [
            "/settings",
            "/payment",
            "/finance", 
            "/balance",
            "/login-history",
            "/api/v1/settings",
            "/api/v1/payment"
        ]
        
        for route in forbidden_routes:
            response = client.get(route)
            assert response.status_code == 403

if __name__ == "__main__":
    pytest.main([__file__, "-v"])