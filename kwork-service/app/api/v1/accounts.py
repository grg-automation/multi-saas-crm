from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import logging

from ...core.database import get_db
from ...core.security import get_current_user, encrypt_password, security_manager
from ...models.schemas import (
    KworkAccountCreate,
    KworkAccountResponse,
    KworkAccountSwitch,
    SuccessResponse,
    RateLimitInfo
)
from ...services.kwork_client import client_manager
from ...core.rate_limiter import account_rate_limiter

logger = logging.getLogger(__name__)
router = APIRouter()
accounts_router = router
from pydantic import BaseModel


class SwitchAccountRequest(BaseModel):
    account_id: str



@router.post("/", response_model=KworkAccountResponse)
async def add_account(
    account_data: KworkAccountCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Добавление нового аккаунта Kwork"""
    
    # Проверка лимита аккаунтов (максимум 10 на пользователя)
    existing_accounts = await db.execute_many(
        "SELECT id FROM kwork_accounts WHERE user_id = $1 AND is_active = TRUE",
        (current_user["id"],)
    )
    
    if len(existing_accounts) >= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 accounts allowed per user"
        )
    
    # Проверка на дублирование логина
    existing_login = await db.execute_query(
        "SELECT id FROM kwork_accounts WHERE login = $1 AND is_active = TRUE",
        (account_data.login,)
    )
    
    if existing_login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account with this login already exists"
        )
    
    # Шифрование пароля
    encrypted_password = encrypt_password(account_data.password)
    
    # Создание записи в БД
    account_id = await db.execute_insert(
        """INSERT INTO kwork_accounts (user_id, login, encrypted_password, account_name) 
           VALUES ($1, $2, $3, $4)""",
        (
            current_user["id"],
            account_data.login,
            encrypted_password,
            account_data.account_name or account_data.login
        )
    )
    
    # Получение созданного аккаунта
    account = await db.execute_query(
        "SELECT * FROM kwork_accounts WHERE id = $1",
        (account_id,)
    )
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create account"
        )
    
    await db.log_action(
        user_id=current_user["id"],
        account_id=account_id,
        action_type="account_add",
        description=f"Added Kwork account: {account_data.login}"
    )
    
    logger.info(f"New Kwork account added: {account_data.login} by user {current_user['username']}")
    
    return KworkAccountResponse(**account)

@router.get("/", response_model=List[KworkAccountResponse])
async def get_accounts(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение списка аккаунтов пользователя"""
    
    accounts = await db.execute_many(
        "SELECT * FROM kwork_accounts WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC",
        (current_user["id"],)
    )
    
    return [KworkAccountResponse(**account) for account in accounts]

@router.post("/{account_id}/switch", response_model=SuccessResponse)
@router.post("/switch")
async def switch_account(data: SwitchAccountRequest, current_user: dict = Depends(get_current_user),
                         db=Depends(get_db)):
    """Смена активного аккаунта"""

    account = await db.execute_query(
        "SELECT id, login, encrypted_password FROM kwork_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE",
        (data.account_id, current_user["id"])
    )

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    client = await client_manager.get_client(
        account_id=account["id"],
        login=account["login"],
        encrypted_password=account["encrypted_password"]
    )

    # 🔑 Здесь добавляем вызов авторизации
    authenticated = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
    if not authenticated:
        raise HTTPException(status_code=401, detail="Failed to authenticate Kwork account")

    await client_manager.set_active_account(account["id"])

    return {"message": f"Account {account['login']} is now active"}

@router.delete("/{account_id}", response_model=SuccessResponse)
async def delete_account(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Удаление аккаунта"""
    
    # Проверка принадлежности аккаунта пользователю
    account = await db.execute_query(
        "SELECT * FROM kwork_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE",
        (account_id, current_user["id"])
    )
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    # Мягкое удаление (деактивация)
    await db.execute_update(
        "UPDATE kwork_accounts SET is_active = FALSE WHERE id = $1",
        (account_id,)
    )
    
    # Закрытие клиента если он активен
    if str(account_id) in client_manager.clients:
        client = client_manager.clients[str(account_id)]
        await client.close()
        del client_manager.clients[str(account_id)]
    
    await db.log_action(
        user_id=current_user["id"],
        account_id=account_id,
        action_type="account_delete",
        description=f"Deleted account: {account['login']}"
    )
    
    logger.info(f"User {current_user['username']} deleted account {account['login']}")
    
    return SuccessResponse(message="Account successfully deleted")

@router.get("/{account_id}/rate-limits", response_model=RateLimitInfo)
async def get_rate_limits(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение информации о лимитах для аккаунта"""
    
    # Проверка принадлежности аккаунта пользователю
    account = await db.execute_query(
        "SELECT * FROM kwork_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE",
        (account_id, current_user["id"])
    )
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    # Получение информации о лимитах
    rate_limits = await account_rate_limiter.get_rate_limit_info(str(account_id))
    
    return RateLimitInfo(**rate_limits)

@router.post("/{account_id}/test-connection", response_model=SuccessResponse)
async def test_connection(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Тестирование подключения к аккаунту через Playwright"""

    logger.info(f"[test_connection] Starting test for account_id={account_id}, user_id={current_user['id']}")

    account = await db.execute_query(
        "SELECT * FROM kwork_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE",
        (account_id, current_user["id"])
    )

    if not account:
        logger.warning(f"[test_connection] Account not found or inactive: id={account_id}, user_id={current_user['id']}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    logger.info(f"[test_connection] Account found: {account['login']}")

    try:
        client = await client_manager.get_client(
            str(account_id),
            account["login"],
            account["encrypted_password"]
        )

        logger.info(f"[test_connection] Client initialized for {account['login']}")

        auth_success = await client.authenticate_with_playwright()

        if auth_success:
            logger.info(f"[test_connection] Playwright authentication successful for {account['login']}")

            account_info = await client.get_account_info()
            logger.info(f"[test_connection] Retrieved account_info: {account_info}")
            await client.save_account_info_to_db(
                db,
                account_id=account_id,
                info=account_info
            )
            await db.log_action(
                user_id=current_user["id"],
                account_id=account_id,
                action_type="account_test",
                description=f"Playwright connection test successful for {account['login']}"
            )

            return SuccessResponse(
                message="Connection successful",
                data={"account_info": account_info}
            )
        else:
            logger.error(f"[test_connection] Playwright authentication failed for account {account['login']}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed"
            )

    except Exception as e:
        logger.exception(f"[test_connection] Playwright connection test failed for account {account['login']}: {e}")

        await db.log_action(
            user_id=current_user["id"],
            account_id=account_id,
            action_type="account_test_failed",
            description=f"Playwright connection test failed for {account['login']}: {str(e)}"
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Connection test failed: {str(e)}"
        )
import json
from ...core.database import Database
from ...models.schemas import AccountInfo
@router.get("/{account_id}/info", response_model=AccountInfo)
async def get_account_info(account_id: int, db: Database = Depends(get_db)):
    row = await db.execute_query("""
        SELECT * FROM account_info
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    """, (account_id,))

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account info not found"
        )

    try:
        skills = json.loads(row["skills"]) if row["skills"] else []
    except Exception:
        skills = []

    return AccountInfo(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        full_name=row["full_name"],
        avatar_url=row["avatar_url"],
        location=row["location"],
        joined=row["joined"],
        is_online=row["is_online"],
        profession=row["profession"],
        about_me=row["about_me"],
        skills=skills,
        last_seen=row["last_seen"]
    )