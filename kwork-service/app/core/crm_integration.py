import httpx
import logging
from typing import Optional, Dict, Any
from fastapi import HTTPException, Request
from .config import settings

logger = logging.getLogger(__name__)

class CRMIntegration:
    """Интеграция с основной CRM системой"""
    
    def __init__(self):
        self.crm_api_url = settings.CRM_API_URL
        self.api_gateway_url = settings.API_GATEWAY_URL
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": settings.CRM_API_KEY
        } if settings.CRM_API_KEY else {"Content-Type": "application/json"}
    
    async def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Проверка токена через API Gateway"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_gateway_url}/auth/verify",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10.0
                )
                if response.status_code == 200:
                    return response.json()
                return None
        except Exception as e:
            logger.error(f"Error verifying token: {e}")
            return None
    
    async def get_tenant_info(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Получение информации о тенанте"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.crm_api_url}/api/v1/tenants/{tenant_id}",
                    headers=self.headers,
                    timeout=10.0
                )
                if response.status_code == 200:
                    return response.json()
                return None
        except Exception as e:
            logger.error(f"Error getting tenant info: {e}")
            return None
    
    async def create_lead_from_kwork_order(self, order_data: Dict[str, Any], tenant_id: str) -> Optional[Dict[str, Any]]:
        """Создание лида из заказа Kwork"""
        try:
            lead_data = {
                "name": order_data.get("title", "Kwork Order"),
                "description": order_data.get("description", ""),
                "budget": order_data.get("budget", 0),
                "source": "kwork",
                "external_id": order_data.get("id"),
                "tenant_id": tenant_id,
                "status": "new"
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.crm_api_url}/api/v1/leads",
                    json=lead_data,
                    headers=self.headers,
                    timeout=10.0
                )
                if response.status_code == 201:
                    return response.json()
                return None
        except Exception as e:
            logger.error(f"Error creating lead from Kwork order: {e}")
            return None
    
    async def update_lead_status(self, lead_id: str, status: str, tenant_id: str) -> bool:
        """Обновление статуса лида"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.patch(
                    f"{self.crm_api_url}/api/v1/leads/{lead_id}",
                    json={"status": status},
                    headers=self.headers,
                    timeout=10.0
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Error updating lead status: {e}")
            return False
    
    async def create_contact_from_kwork_user(self, user_data: Dict[str, Any], tenant_id: str) -> Optional[Dict[str, Any]]:
        """Создание контакта из пользователя Kwork"""
        try:
            contact_data = {
                "name": user_data.get("name", "Kwork User"),
                "email": user_data.get("email"),
                "phone": user_data.get("phone"),
                "source": "kwork",
                "external_id": user_data.get("id"),
                "tenant_id": tenant_id
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.crm_api_url}/api/v1/contacts",
                    json=contact_data,
                    headers=self.headers,
                    timeout=10.0
                )
                if response.status_code == 201:
                    return response.json()
                return None
        except Exception as e:
            logger.error(f"Error creating contact from Kwork user: {e}")
            return None

# Глобальный экземпляр для использования в других модулях
crm_integration = CRMIntegration() 