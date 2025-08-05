from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
import logging
from .crm_integration import crm_integration
from .config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[Dict[str, Any]]:
    """Получение текущего пользователя из токена"""
    try:
        token = credentials.credentials
        user_data = await crm_integration.verify_token(token)
        
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        return user_data
    except Exception as e:
        logger.error(f"Error getting current user: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

async def get_tenant_id(request: Request) -> str:
    """Получение tenant_id из заголовка или пользователя"""
    # Сначала проверяем заголовок
    tenant_id = request.headers.get(settings.TENANT_ID_HEADER)
    
    if not tenant_id:
        # Если нет в заголовке, пытаемся получить из токена
        try:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                user_data = await crm_integration.verify_token(token)
                if user_data and user_data.get("tenant_id"):
                    tenant_id = user_data["tenant_id"]
        except Exception:
            pass
    
    return tenant_id or settings.DEFAULT_TENANT_ID

async def verify_tenant_access(tenant_id: str) -> bool:
    """Проверка доступа к тенанту"""
    try:
        tenant_info = await crm_integration.get_tenant_info(tenant_id)
        return tenant_info is not None
    except Exception as e:
        logger.error(f"Error verifying tenant access: {e}")
        return False

async def require_tenant_access(request: Request):
    """Middleware для проверки доступа к тенанту"""
    tenant_id = await get_tenant_id(request)
    
    if not await verify_tenant_access(tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")
    
    # Добавляем tenant_id в request state для использования в обработчиках
    request.state.tenant_id = tenant_id
    return tenant_id 