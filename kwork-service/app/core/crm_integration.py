import httpx
import logging
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, Request
from datetime import datetime
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

    async def create_opportunity_from_kwork_order(self, order_data: Dict[str, Any], tenant_id: str, contact_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Создание возможности (Opportunity) из заказа Kwork"""
        try:
            opportunity_data = {
                "name": order_data.get("title", "Kwork Opportunity"),
                "description": f"Kwork Order: {order_data.get('description', '')}",
                "amount": float(order_data.get("budget", 0)),
                "stage": self.map_kwork_order_status_to_crm_stage(order_data.get("status", "new")),
                "source": "kwork",
                "external_id": str(order_data.get("id")),
                "tenant_id": tenant_id,
                "contact_id": contact_id,
                "expected_close_date": self.calculate_expected_close_date(order_data),
                "probability": self.calculate_probability_from_kwork_status(order_data.get("status", "new")),
                "metadata": {
                    "kwork_order_id": order_data.get("id"),
                    "kwork_category": order_data.get("category"),
                    "kwork_deadline": order_data.get("deadline"),
                    "kwork_requirements": order_data.get("requirements"),
                    "kwork_client_rating": order_data.get("client_rating"),
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.crm_api_url}/api/v1/opportunities",
                    json=opportunity_data,
                    headers=self.headers,
                    timeout=10.0
                )
                if response.status_code == 201:
                    return response.json()
                return None
        except Exception as e:
            logger.error(f"Error creating opportunity from Kwork order: {e}")
            return None

    async def create_activity_from_kwork_message(self, message_data: Dict[str, Any], tenant_id: str, contact_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Создание активности из сообщения Kwork"""
        try:
            activity_data = {
                "subject": f"Kwork Message: {message_data.get('subject', 'New Message')[:100]}",
                "description": message_data.get("content", ""),
                "activity_type": "kwork_message",
                "status": "completed",
                "priority": self.determine_message_priority(message_data),
                "tenant_id": tenant_id,
                "contact_id": contact_id,
                "due_date": datetime.utcnow().isoformat(),
                "completed_date": datetime.utcnow().isoformat(),
                "metadata": {
                    "kwork_message_id": message_data.get("id"),
                    "kwork_chat_id": message_data.get("chat_id"),
                    "kwork_sender_id": message_data.get("sender_id"),
                    "kwork_sender_name": message_data.get("sender_name"),
                    "kwork_message_type": message_data.get("message_type"),
                    "kwork_attachments": message_data.get("attachments"),
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.crm_api_url}/api/v1/activities",
                    json=activity_data,
                    headers=self.headers,
                    timeout=10.0
                )
                if response.status_code == 201:
                    return response.json()
                return None
        except Exception as e:
            logger.error(f"Error creating activity from Kwork message: {e}")
            return None

    async def sync_kwork_order_with_crm(self, order_data: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        """Полная синхронизация заказа Kwork с CRM (контакт + возможность + активности)"""
        result = {
            "contact": None,
            "opportunity": None,
            "activities": [],
            "errors": []
        }
        
        try:
            # Создание или поиск контакта
            if order_data.get("client_info"):
                client_info = order_data["client_info"]
                contact = await self.create_contact_from_kwork_user(client_info, tenant_id)
                if contact:
                    result["contact"] = contact
                    contact_id = contact["id"]
                else:
                    result["errors"].append("Failed to create contact")
                    contact_id = None
            else:
                contact_id = None
            
            # Создание возможности
            opportunity = await self.create_opportunity_from_kwork_order(order_data, tenant_id, contact_id)
            if opportunity:
                result["opportunity"] = opportunity
            else:
                result["errors"].append("Failed to create opportunity")
            
            # Создание активностей из сообщений
            if order_data.get("messages"):
                for message in order_data["messages"]:
                    activity = await self.create_activity_from_kwork_message(message, tenant_id, contact_id)
                    if activity:
                        result["activities"].append(activity)
                    else:
                        result["errors"].append(f"Failed to create activity from message {message.get('id')}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error in full Kwork order sync: {e}")
            result["errors"].append(str(e))
            return result

    async def update_opportunity_from_kwork_status(self, external_id: str, status: str, tenant_id: str) -> bool:
        """Обновление статуса возможности на основе статуса заказа Kwork"""
        try:
            stage = self.map_kwork_order_status_to_crm_stage(status)
            probability = self.calculate_probability_from_kwork_status(status)
            
            async with httpx.AsyncClient() as client:
                # Сначала найдем opportunity по external_id
                search_response = await client.get(
                    f"{self.crm_api_url}/api/v1/opportunities",
                    params={"external_id": external_id, "tenant_id": tenant_id},
                    headers=self.headers,
                    timeout=10.0
                )
                
                if search_response.status_code == 200:
                    opportunities = search_response.json().get("data", [])
                    if opportunities:
                        opportunity_id = opportunities[0]["id"]
                        
                        # Обновляем opportunity
                        update_response = await client.patch(
                            f"{self.crm_api_url}/api/v1/opportunities/{opportunity_id}",
                            json={
                                "stage": stage,
                                "probability": probability,
                                "updated_at": datetime.utcnow().isoformat()
                            },
                            headers=self.headers,
                            timeout=10.0
                        )
                        return update_response.status_code == 200
                
                return False
        except Exception as e:
            logger.error(f"Error updating opportunity from Kwork status: {e}")
            return False

    def map_kwork_order_status_to_crm_stage(self, kwork_status: str) -> str:
        """Маппинг статусов заказов Kwork в стадии CRM"""
        mapping = {
            "new": "Qualification",
            "in_progress": "Proposal",
            "review": "Negotiation",
            "completed": "Closed Won",
            "cancelled": "Closed Lost",
            "dispute": "Closed Lost",
            "revision": "Negotiation",
        }
        return mapping.get(kwork_status.lower(), "Qualification")

    def calculate_probability_from_kwork_status(self, status: str) -> int:
        """Расчет вероятности закрытия сделки на основе статуса Kwork"""
        probabilities = {
            "new": 10,
            "in_progress": 60,
            "review": 80,
            "completed": 100,
            "cancelled": 0,
            "dispute": 0,
            "revision": 70,
        }
        return probabilities.get(status.lower(), 10)

    def calculate_expected_close_date(self, order_data: Dict[str, Any]) -> Optional[str]:
        """Расчет ожидаемой даты закрытия сделки"""
        if order_data.get("deadline"):
            return order_data["deadline"]
        
        # Если дедлайн не указан, добавляем 30 дней к текущей дате
        from datetime import timedelta
        expected_date = datetime.utcnow() + timedelta(days=30)
        return expected_date.isoformat()

    def determine_message_priority(self, message_data: Dict[str, Any]) -> str:
        """Определение приоритета сообщения"""
        content = message_data.get("content", "").lower()
        if any(keyword in content for keyword in ["urgent", "срочно", "emergency", "critical"]):
            return "high"
        elif any(keyword in content for keyword in ["important", "важно", "deadline", "дедлайн"]):
            return "medium"
        return "low"

    async def get_crm_contact_by_external_id(self, external_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Поиск контакта в CRM по внешнему ID"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.crm_api_url}/api/v1/contacts",
                    params={"external_id": external_id, "tenant_id": tenant_id},
                    headers=self.headers,
                    timeout=10.0
                )
                if response.status_code == 200:
                    contacts = response.json().get("data", [])
                    return contacts[0] if contacts else None
                return None
        except Exception as e:
            logger.error(f"Error finding CRM contact by external ID: {e}")
            return None

    async def bulk_sync_kwork_data(self, data: List[Dict[str, Any]], tenant_id: str, data_type: str = "orders") -> Dict[str, Any]:
        """Массовая синхронизация данных Kwork с CRM"""
        results = {
            "successful": [],
            "failed": [],
            "total_processed": 0,
            "summary": {}
        }
        
        try:
            for item in data:
                results["total_processed"] += 1
                
                if data_type == "orders":
                    sync_result = await self.sync_kwork_order_with_crm(item, tenant_id)
                    if not sync_result.get("errors"):
                        results["successful"].append({
                            "external_id": item.get("id"),
                            "type": "order",
                            "result": sync_result
                        })
                    else:
                        results["failed"].append({
                            "external_id": item.get("id"),
                            "type": "order",
                            "errors": sync_result.get("errors")
                        })
                elif data_type == "contacts":
                    contact = await self.create_contact_from_kwork_user(item, tenant_id)
                    if contact:
                        results["successful"].append({
                            "external_id": item.get("id"),
                            "type": "contact",
                            "result": contact
                        })
                    else:
                        results["failed"].append({
                            "external_id": item.get("id"),
                            "type": "contact",
                            "errors": ["Failed to create contact"]
                        })
            
            results["summary"] = {
                "success_rate": len(results["successful"]) / results["total_processed"] * 100 if results["total_processed"] > 0 else 0,
                "successful_count": len(results["successful"]),
                "failed_count": len(results["failed"])
            }
            
            return results
            
        except Exception as e:
            logger.error(f"Error in bulk sync: {e}")
            results["failed"].append({
                "external_id": "bulk_operation",
                "type": "system",
                "errors": [str(e)]
            })
            return results

# Глобальный экземпляр для использования в других модулях
crm_integration = CRMIntegration() 