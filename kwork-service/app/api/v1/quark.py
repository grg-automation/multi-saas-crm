from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import logging

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.schemas import (
    QuarkCreate,
    QuarkResponse,
    QuarkStage,
    SuccessResponse
)
from ...services.kwork_client import client_manager

logger = logging.getLogger(__name__)
router = APIRouter()
quark_router = router

@router.post("/", response_model=QuarkResponse)
async def create_quark(
    quark_data: QuarkCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Создание предложения (Quark)"""
    
    client = await client_manager.get_active_client()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Kwork account"
        )
    
    if not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kwork account not authenticated"
        )
    
    try:
        # Создание Quark
        result = await client.create_quark(
            title=quark_data.title,
            description=quark_data.description,
            category=quark_data.category,
            price=quark_data.price,
            stages=[stage.dict() for stage in quark_data.stages]
        )
        
        quark = QuarkResponse(
            id=result["id"],
            title=result["title"],
            description=result["description"],
            category=result["category"],
            price=result["price"],
            stages=result["stages"],
            status=result.get("status", "pending"),
            created_at=result["created_at"]
        )
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="quark_create",
            description=f"Created quark: {quark_data.title}"
        )
        
        logger.info(f"User {current_user['username']} created quark: {quark_data.title}")
        
        return quark
        
    except Exception as e:
        logger.error(f"Error creating quark: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="quark_create_failed",
            description=f"Failed to create quark: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create quark: {str(e)}"
        )

@router.get("/{quark_id}", response_model=QuarkResponse)
async def get_quark(
    quark_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение информации о Quark"""
    
    client = await client_manager.get_active_client()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Kwork account"
        )
    
    if not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kwork account not authenticated"
        )
    
    try:
        # Получение информации о Quark
        quark_data = await client.get_quark(quark_id)
        
        quark = QuarkResponse(
            id=quark_data["id"],
            title=quark_data["title"],
            description=quark_data["description"],
            category=quark_data["category"],
            price=quark_data["price"],
            stages=quark_data["stages"],
            status=quark_data.get("status", "pending"),
            created_at=quark_data["created_at"]
        )
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="quark_view",
            description=f"Viewed quark {quark_id}"
        )
        
        return quark
        
    except Exception as e:
        logger.error(f"Error fetching quark {quark_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch quark: {str(e)}"
        )

@router.patch("/{quark_id}", response_model=SuccessResponse)
async def update_quark(
    quark_id: str,
    stages: List[QuarkStage],
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Обновление этапов Quark"""
    
    client = await client_manager.get_active_client()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Kwork account"
        )
    
    if not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kwork account not authenticated"
        )
    
    try:
        # Обновление этапов Quark
        result = await client.update_quark_stages(
            quark_id=quark_id,
            stages=[stage.dict() for stage in stages]
        )
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="quark_update",
            description=f"Updated quark {quark_id}"
        )
        
        logger.info(f"User {current_user['username']} updated quark {quark_id}")
        
        return SuccessResponse(
            message="Quark updated successfully",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error updating quark {quark_id}: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="quark_update_failed",
            description=f"Failed to update quark {quark_id}: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update quark: {str(e)}"
        )

@router.delete("/{quark_id}", response_model=SuccessResponse)
async def delete_quark(
    quark_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Удаление Quark"""
    
    client = await client_manager.get_active_client()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Kwork account"
        )
    
    if not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kwork account not authenticated"
        )
    
    try:
        # Удаление Quark
        result = await client.delete_quark(quark_id)
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="quark_delete",
            description=f"Deleted quark {quark_id}"
        )
        
        logger.info(f"User {current_user['username']} deleted quark {quark_id}")
        
        return SuccessResponse(
            message="Quark deleted successfully",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error deleting quark {quark_id}: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="quark_delete_failed",
            description=f"Failed to delete quark {quark_id}: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete quark: {str(e)}"
        )

@router.get("/", response_model=List[QuarkResponse])
async def get_my_quarks(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение моих Quark"""
    
    client = await client_manager.get_active_client()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Kwork account"
        )
    
    if not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kwork account not authenticated"
        )
    
    try:
        # Получение моих Quark
        quarks_data = await client.get_my_quarks()
        
        quarks = []
        for quark_data in quarks_data.get("quarks", []):
            quarks.append(QuarkResponse(
                id=quark_data["id"],
                title=quark_data["title"],
                description=quark_data["description"],
                category=quark_data["category"],
                price=quark_data["price"],
                stages=quark_data["stages"],
                status=quark_data.get("status", "pending"),
                created_at=quark_data["created_at"]
            ))
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="quarks_view",
            description="Viewed my quarks"
        )
        
        return quarks
        
    except Exception as e:
        logger.error(f"Error fetching my quarks: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch my quarks: {str(e)}"
        )






@router.get("/parse-kworks/{account_id}/with-details", response_model=SuccessResponse)
async def parse_kworks_with_details_route(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """
    Авторизуемся через Playwright и парсим список кворков с деталями.
    Возвращаем SuccessResponse при успехе.
    """
    # 1. Проверка аккаунта
    account = await db.execute_query(
        "SELECT id, login, encrypted_password FROM kwork_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE",
        (account_id, current_user["id"])
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # 2. Получаем клиента
    client = await client_manager.get_client(
        str(account["id"]),
        account["login"],
        account["encrypted_password"]
    )

    # 3. Аутентификация через Playwright
    logger.info(f"[kworks/parse-with-details] Authenticating account {account['login']}")
    auth_ok = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
    if not auth_ok:
        logger.error(f"[kworks/parse-with-details] Playwright auth failed for {account['login']}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    logger.info(f"[kworks/parse-with-details] Auth successful, starting parse_all_kworks_with_details()")

    # 4. Парсинг кворков с деталями
    kworks = await client.parse_all_kworks_with_details(account["login"])

    logger.info(f"[kworks/parse-with-details] Parsed {len(kworks)} kworks with details")

    return SuccessResponse(
        message="Kworks with details parsed successfully",
        data={"count": len(kworks), "kworks": kworks}
    )
