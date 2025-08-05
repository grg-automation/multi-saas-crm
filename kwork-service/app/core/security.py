from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from cryptography.fernet import Fernet
import base64
import os
import logging

from .config import settings
from .database import get_db

logger = logging.getLogger(__name__)

# Контекст для хеширования паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security схема для JWT
security = HTTPBearer()

# Ключ для шифрования паролей Kwork аккаунтов
_encryption_key = None

def get_encryption_key():
    """Получение ключа шифрования"""
    global _encryption_key
    if _encryption_key is None:
        key_file = "encryption.key"
        if os.path.exists(key_file):
            with open(key_file, "rb") as f:
                _encryption_key = f.read()
        else:
            _encryption_key = Fernet.generate_key()
            with open(key_file, "wb") as f:
                f.write(_encryption_key)
    return _encryption_key

def hash_password(password: str) -> str:
    """Хеширование пароля"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    return pwd_context.verify(plain_password, hashed_password)

def encrypt_password(password: str) -> str:
    """Шифрование пароля для Kwork аккаунта"""
    fernet = Fernet(get_encryption_key())
    encrypted = fernet.encrypt(password.encode())
    return base64.b64encode(encrypted).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Расшифровка пароля Kwork аккаунта"""
    fernet = Fernet(get_encryption_key())
    encrypted_bytes = base64.b64decode(encrypted_password.encode())
    decrypted = fernet.decrypt(encrypted_bytes)
    return decrypted.decode()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создание JWT токена"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Dict[str, Any]:
    """Проверка JWT токена"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db = Depends(get_db)
) -> Dict[str, Any]:
    """Получение текущего пользователя из JWT токена"""
    token = credentials.credentials
    payload = verify_token(token)
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Получение пользователя из базы данных
    user = await db.execute_query(
        "SELECT * FROM users WHERE id = $1 AND is_active = TRUE",
        (int(user_id),)
    )
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user

async def get_current_active_user(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Получение активного пользователя"""
    if not current_user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user

class SecurityManager:
    """Менеджер безопасности для работы с аккаунтами"""
    
    def __init__(self):
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
    
    async def create_session(self, user_id: int, account_id: Optional[int] = None) -> str:
        """Создание сессии"""
        token_data = {
            "sub": str(user_id),
            "account_id": account_id,
            "type": "session"
        }
        
        session_token = create_access_token(token_data)
        
        # Сохранение в базе данных
        db = await get_db()
        await db.execute_insert(
            """INSERT INTO sessions (user_id, account_id, session_token, expires_at) 
               VALUES ($1, $2, $3, $4)""",
            (
                user_id,
                account_id,
                session_token,
                datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            )
        )
        
        return session_token
    
    async def validate_session(self, session_token: str) -> Optional[Dict[str, Any]]:
        """Валидация сессии"""
        try:
            payload = verify_token(session_token)
            
            # Проверка в базе данных
            db = await get_db()
            session = await db.execute_query(
                """SELECT * FROM sessions 
                   WHERE session_token = $1 AND is_active = TRUE AND expires_at > $2""",
                (session_token, datetime.utcnow())
            )
            
            if session:
                return session
            
        except Exception as e:
            logger.error(f"Session validation error: {e}")
        
        return None
    
    async def revoke_session(self, session_token: str):
        """Отзыв сессии"""
        db = await get_db()
        await db.execute_update(
            "UPDATE sessions SET is_active = FALSE WHERE session_token = ?",
            (session_token,)
        )
    
    async def ensure_single_account_access(self, user_id: int, account_id: int):
        """Обеспечение доступа только к одному аккаунту одновременно"""
        # Деактивация других активных сессий пользователя
        db = await get_db()
        await db.execute_update(
            """UPDATE sessions SET is_active = FALSE 
               WHERE user_id = $1 AND account_id != $2 AND is_active = TRUE""",
            (user_id, account_id)
        )

# Глобальный экземпляр менеджера безопасности
security_manager = SecurityManager()