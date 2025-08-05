from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import logging

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.schemas import (
    GigUpdate,
    GigResponse,
    SuccessResponse
)
from ...services.kwork_client import client_manager

logger = logging.getLogger(__name__)
router = APIRouter()
gigs_router = router

@router.get("/", response_model=List[GigResponse])
async def get_my_gigs(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение моих кворков"""
    
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
        # Получение моих кворков
        gigs_data = await client.get_my_gigs()
        
        gigs = []
        for gig_data in gigs_data.get("gigs", []):
            gigs.append(GigResponse(
                id=gig_data["id"],
                title=gig_data["title"],
                description=gig_data["description"],
                category=gig_data["category"],
                price=gig_data["price"],
                currency=gig_data.get("currency", "RUB"),
                rating=gig_data.get("rating"),
                reviews_count=gig_data.get("reviews_count", 0),
                orders_count=gig_data.get("orders_count", 0),
                tags=gig_data.get("tags", []),
                is_active=gig_data.get("is_active", True),
                created_at=gig_data["created_at"]
            ))
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="gigs_view",
            description="Viewed my gigs"
        )
        
        return gigs
        
    except Exception as e:
        logger.error(f"Error fetching my gigs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch my gigs: {str(e)}"
        )

@router.get("/{gig_id}", response_model=GigResponse)
async def get_gig(
    gig_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение информации о кворке"""
    
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
        # Получение информации о кворке
        gig_data = await client.get_gig(gig_id)
        
        gig = GigResponse(
            id=gig_data["id"],
            title=gig_data["title"],
            description=gig_data["description"],
            category=gig_data["category"],
            price=gig_data["price"],
            currency=gig_data.get("currency", "RUB"),
            rating=gig_data.get("rating"),
            reviews_count=gig_data.get("reviews_count", 0),
            orders_count=gig_data.get("orders_count", 0),
            tags=gig_data.get("tags", []),
            is_active=gig_data.get("is_active", True),
            created_at=gig_data["created_at"]
        )
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="gig_view",
            description=f"Viewed gig {gig_id}"
        )
        
        return gig
        
    except Exception as e:
        logger.error(f"Error fetching gig {gig_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch gig: {str(e)}"
        )

@router.put("/{gig_id}", response_model=SuccessResponse)
async def update_gig(
    gig_id: str,
    gig_update: GigUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Обновление кворка с ограничениями безопасности
    Запрещено изменять цены, настройки оплаты и другие критичные параметры
    """
    
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
    
    # Подготовка данных для обновления (только разрешенные поля)
    updates = {}
    
    if gig_update.title is not None:
        updates["title"] = gig_update.title
    
    if gig_update.description is not None:
        updates["description"] = gig_update.description
    
    if gig_update.category is not None:
        updates["category"] = gig_update.category
    
    if gig_update.tags is not None:
        updates["tags"] = gig_update.tags
    
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )
    
    try:
        # Обновление кворка через безопасный метод клиента
        result = await client.update_gig(gig_id, updates)
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="gig_update",
            description=f"Updated gig {gig_id}: {', '.join(updates.keys())}"
        )
        
        logger.info(f"User {current_user['username']} updated gig {gig_id}")
        
        return SuccessResponse(
            message="Gig updated successfully",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error updating gig {gig_id}: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="gig_update_failed",
            description=f"Failed to update gig {gig_id}: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update gig: {str(e)}"
        )

@router.patch("/{gig_id}/toggle", response_model=SuccessResponse)
async def toggle_gig_status(
    gig_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Переключение статуса кворка (активен/неактивен)"""
    
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
        # Переключение статуса кворка
        result = await client.toggle_gig_status(gig_id)
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="gig_toggle",
            description=f"Toggled status for gig {gig_id}"
        )
        
        logger.info(f"User {current_user['username']} toggled status for gig {gig_id}")
        
        return SuccessResponse(
            message="Gig status toggled successfully",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error toggling gig {gig_id} status: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="gig_toggle_failed",
            description=f"Failed to toggle gig {gig_id} status: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to toggle gig status: {str(e)}"
        )

@router.get("/{gig_id}/stats", response_model=dict)
async def get_gig_stats(
    gig_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение статистики кворка"""
    
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
        # Получение статистики кворка
        stats_data = await client.get_gig_stats(gig_id)
        
        # Фильтрация финансовых данных для безопасности
        safe_stats = {
            "views": stats_data.get("views", 0),
            "orders": stats_data.get("orders", 0),
            "rating": stats_data.get("rating"),
            "reviews_count": stats_data.get("reviews_count", 0),
            "favorites": stats_data.get("favorites", 0),
            "last_order_date": stats_data.get("last_order_date"),
            "conversion_rate": stats_data.get("conversion_rate", 0),
            "position_in_category": stats_data.get("position_in_category")
        }
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="gig_stats_view",
            description=f"Viewed stats for gig {gig_id}"
        )
        
        return safe_stats
        
    except Exception as e:
        logger.error(f"Error fetching gig {gig_id} stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch gig stats: {str(e)}"
        )