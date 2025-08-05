from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer
from datetime import timedelta
import logging

from ...core.config import settings
from ...core.database import get_db
from ...core.security import (
    hash_password, 
    verify_password, 
    create_access_token,
    security_manager,
    get_current_user
)
from ...models.schemas import (
    UserCreate, 
    UserLogin, 
    Token, 
    UserResponse,
    SuccessResponse
)

logger = logging.getLogger(__name__)
router = APIRouter()
auth_router = router

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db = Depends(get_db)):
    """Регистрация нового пользователя"""
    
    # Проверка существования пользователя
    existing_user = await db.execute_query(
        "SELECT id FROM users WHERE username = $1 OR email = $2",
        (user_data.username, user_data.email)
    )
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this username or email already exists"
        )
    
    # Создание пользователя
    hashed_password = hash_password(user_data.password)
    
    user_id = await db.execute_insert(
        """INSERT INTO users (username, email, hashed_password) 
           VALUES ($1, $2, $3)""",
        (user_data.username, user_data.email, hashed_password)
    )
    
    # Получение созданного пользователя
    user = await db.execute_query(
        "SELECT * FROM users WHERE id = $1",
        (user_id,)
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user"
        )
    
    await db.log_action(
        user_id=user_id,
        account_id=None,
        action_type="user_register",
        description=f"User {user_data.username} registered"
    )
    
    logger.info(f"New user registered: {user_data.username}")
    
    return UserResponse(**user)

@router.post("/login", response_model=Token)
async def login(user_data: UserLogin, db = Depends(get_db)):
    """Аутентификация пользователя"""
    
    # Поиск пользователя
    user = await db.execute_query(
        "SELECT * FROM users WHERE username = $1 AND is_active = TRUE",
        (user_data.username,)
    )
    
    if not user or not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Создание JWT токена
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user["id"])}, 
        expires_delta=access_token_expires
    )
    
    # Создание сессии
    session_token = await security_manager.create_session(user["id"])
    
    await db.log_action(
        user_id=user["id"],
        account_id=None,
        action_type="user_login",
        description=f"User {user_data.username} logged in"
    )
    
    logger.info(f"User logged in: {user_data.username}")
    
    return Token(access_token=access_token)

@router.post("/logout", response_model=SuccessResponse)
async def logout(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Выход из системы"""
    
    # Здесь можно деактивировать сессию если нужно
    await db.log_action(
        user_id=current_user["id"],
        account_id=None,
        action_type="user_logout",
        description=f"User {current_user['username']} logged out"
    )
    
    logger.info(f"User logged out: {current_user['username']}")
    
    return SuccessResponse(message="Successfully logged out")

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Получение информации о текущем пользователе"""
    return UserResponse(**current_user)

