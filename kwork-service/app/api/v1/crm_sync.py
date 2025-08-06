from fastapi import APIRouter, Query, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
import logging
from ...core.database import get_db
from ...core.crm_integration import crm_integration
from ...services.kwork_client import client_manager
from ...models.schemas import SuccessResponse

logger = logging.getLogger(__name__)
router = APIRouter()
crm_sync_router = router

@router.post("/sync-orders", response_model=SuccessResponse)
async def sync_orders_to_crm(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    category: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    db = Depends(get_db)
):
    """Синхронизация заказов Kwork с CRM лидами"""
    client = await client_manager.get_active_client()
    if not client or not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No authenticated Kwork account available"
        )
    try:
        # Получение заказов
        filters = {}
        if category:
            filters["category"] = category
        if min_price is not None:
            filters["min_price"] = min_price
        if max_price is not None:
            filters["max_price"] = max_price
        orders_data = await client.get_orders(
            page=page,
            limit=limit,
            filters=filters
        )
        created_leads = []
        failed_leads = []
        tenant_id = "00000000-0000-0000-0000-000000000001"  # Hardcoded for testing
        for order_data in orders_data.get("orders", []):
            try:
                lead = await crm_integration.create_lead_from_kwork_order(order_data, tenant_id)
                if lead:
                    created_leads.append({
                        "order_id": order_data["id"],
                        "lead_id": lead["id"],
                        "lead_name": lead["name"]
                    })
                    logger.info(f"Created lead {lead['id']} from Kwork order {order_data['id']}")
                else:
                    failed_leads.append({
                        "order_id": order_data["id"],
                        "reason": "Failed to create lead"
                    })
            except Exception as e:
                failed_leads.append({
                    "order_id": order_data["id"],
                    "reason": str(e)
                })
                logger.error(f"Failed to create lead from order {order_data['id']}: {e}")
        # Логирование действия
        await db.log_action(
            user_id="test-user",  # Mock user ID for testing
            account_id=int(client.account_id),
            action_type="crm_sync_orders",
            description=f"Synced {len(created_leads)} orders to CRM"
        )
        return SuccessResponse(
            success=True,
            message=f"Successfully synced {len(created_leads)} orders to CRM",
            data={
                "created_leads": created_leads,
                "failed_leads": failed_leads,
                "total_processed": len(orders_data.get("orders", [])),
                "tenant_id": tenant_id
            }
        )
    except Exception as e:
        logger.error(f"Error syncing orders to CRM: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync orders to CRM"
        )

@router.post("/sync-contacts", response_model=SuccessResponse)
async def sync_contacts_to_crm(
    db = Depends(get_db)
):
    """Синхронизация контактов Kwork с CRM"""
    client = await client_manager.get_active_client()
    if not client or not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No authenticated Kwork account available"
        )
    try:
        # Получение информации о пользователе Kwork
        user_info = await client.get_account_info()
        if not user_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get Kwork account information"
            )
        # Создание контакта в CRM
        contact_data = {
            "id": user_info.get("id"),
            "name": user_info.get("name", "Kwork User"),
            "email": user_info.get("email"),
            "phone": user_info.get("phone")
        }
        tenant_id = "00000000-0000-0000-0000-000000000001"  # Hardcoded for testing
        contact = await crm_integration.create_contact_from_kwork_user(contact_data, tenant_id)
        if contact:
            await db.log_action(
                user_id="test-user",  # Mock user ID for testing
                account_id=int(client.account_id),
                action_type="crm_sync_contact",
                description=f"Synced Kwork contact to CRM: {contact['id']}"
            )
            return SuccessResponse(
                success=True,
                message="Successfully synced Kwork contact to CRM",
                data={
                    "contact_id": contact["id"],
                    "contact_name": contact["name"],
                    "tenant_id": tenant_id
                }
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create contact in CRM"
            )
    except Exception as e:
        logger.error(f"Error syncing contact to CRM: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync contact to CRM"
        )

@router.get("/sync-status", response_model=Dict[str, Any])
async def get_sync_status():
    """Получение статуса синхронизации с CRM"""
    try:
        # Проверка доступности CRM
        tenant_id = "00000000-0000-0000-0000-000000000001"  # Hardcoded for testing
        tenant_info = await crm_integration.get_tenant_info(tenant_id)
        return {
            "crm_available": tenant_info is not None,
            "tenant_id": tenant_id,
            "tenant_info": tenant_info,
            "last_sync": None,  # TODO: добавить отслеживание последней синхронизации
            "sync_enabled": True
        }
    except Exception as e:
        logger.error(f"Error getting sync status: {e}")
        return {
            "crm_available": False,
            "tenant_id": tenant_id,
            "error": str(e),
            "sync_enabled": False
        }