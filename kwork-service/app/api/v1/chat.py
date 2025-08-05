from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List
import logging

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.schemas import (
    ChatMessageResponse,
    ChatMessageCreate,
    SuccessResponse,
    PaginatedResponse
)
from ...services.kwork_client import client_manager

logger = logging.getLogger(__name__)
router = APIRouter()
chat_router = router

@router.get("/{dialog_id}/messages", response_model=PaginatedResponse)
async def get_chat_messages(
    dialog_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение сообщений чата"""
    
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
        # Получение сообщений чата
        messages_data = await client.get_chat_messages(
            dialog_id=dialog_id,
            page=page
        )
        
        messages = []
        for msg_data in messages_data.get("messages", []):
            messages.append(ChatMessageResponse(
                id=msg_data["id"],
                sender_id=msg_data["sender_id"],
                sender_name=msg_data["sender_name"],
                message=msg_data["message"],
                files=msg_data.get("files", []),
                timestamp=msg_data["timestamp"],
                is_read=msg_data.get("is_read", False)
            ))
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="chat_view",
            description=f"Viewed chat {dialog_id}"
        )
        
        return PaginatedResponse(
            items=messages,
            page=page,
            limit=limit,
            total=messages_data.get("total", len(messages)),
            pages=messages_data.get("pages", 1)
        )
        
    except Exception as e:
        logger.error(f"Error fetching chat messages for dialog {dialog_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch chat messages: {str(e)}"
        )

@router.post("/{dialog_id}/send", response_model=SuccessResponse)
async def send_message(
    dialog_id: str,
    message_data: ChatMessageCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Отправка сообщения в чат"""
    
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
        # Отправка сообщения
        result = await client.send_message(
            dialog_id=dialog_id,
            message=message_data.message,
            files=message_data.files
        )
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="chat_send",
            description=f"Sent message to dialog {dialog_id}"
        )
        
        logger.info(f"User {current_user['username']} sent message to dialog {dialog_id}")
        
        return SuccessResponse(
            message="Message sent successfully",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error sending message to dialog {dialog_id}: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="chat_send_failed",
            description=f"Failed to send message to dialog {dialog_id}: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send message: {str(e)}"
        )

@router.get("/", response_model=List[dict])
async def get_chat_list(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение списка диалогов"""
    
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
        # Получение списка диалогов
        dialogs_data = await client.get_chat_list()
        
        dialogs = []
        for dialog_data in dialogs_data.get("dialogs", []):
            dialogs.append({
                "id": dialog_data["id"],
                "title": dialog_data["title"],
                "last_message": dialog_data.get("last_message"),
                "last_message_time": dialog_data.get("last_message_time"),
                "unread_count": dialog_data.get("unread_count", 0),
                "participant": dialog_data.get("participant", {}),
                "order_id": dialog_data.get("order_id")
            })
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="chat_list_view",
            description="Viewed chat list"
        )
        
        return dialogs
        
    except Exception as e:
        logger.error(f"Error fetching chat list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch chat list: {str(e)}"
        )

@router.patch("/{dialog_id}/read", response_model=SuccessResponse)
async def mark_messages_as_read(
    dialog_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Отметка сообщений как прочитанных"""
    
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
        # Отметка сообщений как прочитанных
        result = await client.mark_messages_as_read(dialog_id)
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="chat_mark_read",
            description=f"Marked messages as read in dialog {dialog_id}"
        )
        
        return SuccessResponse(
            message="Messages marked as read",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error marking messages as read for dialog {dialog_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark messages as read: {str(e)}"
        )

@router.get("/{dialog_id}/info", response_model=dict)
async def get_dialog_info(
    dialog_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение информации о диалоге"""
    
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
        # Получение информации о диалоге
        dialog_info = await client.get_dialog_info(dialog_id)
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="dialog_info_view",
            description=f"Viewed dialog info {dialog_id}"
        )
        
        return {
            "id": dialog_info["id"],
            "title": dialog_info["title"],
            "participant": dialog_info.get("participant", {}),
            "order": dialog_info.get("order", {}),
            "created_at": dialog_info.get("created_at"),
            "status": dialog_info.get("status"),
            "can_send_messages": dialog_info.get("can_send_messages", True)
        }
        
    except Exception as e:
        logger.error(f"Error fetching dialog info for {dialog_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dialog info: {str(e)}"
        )

@router.get("/parse-chats/{account_id}", response_model=SuccessResponse)
async def parse_chats_with_auth(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Авторизуемся через Playwright и парсим список чатов.
    Возвращаем SuccessResponse при удаче.
    """
    # 1. Проверка аккаунта
    account = await db.execute_query(
        "SELECT id, login, encrypted_password FROM kwork_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE",
        (account_id, current_user["id"])
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # 2. Получаем клиент
    client = await client_manager.get_client(
        str(account["id"]),
        account["login"],
        account["encrypted_password"]
    )

    # 3. Аутентификация через Playwright
    logger.info(f"[chats/parse] Authenticating account {account['login']}")
    auth_ok = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
    if not auth_ok:
        logger.error(f"[chats/parse] Playwright auth failed for {account['login']}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    logger.info(f"[chats/parse] Auth successful, starting parse_chats()")

    # 4. Парсинг чатов
    chats = await client.parse_chats()

    logger.info(f"[chats/parse] Parsed {len(chats)} chats")

    return SuccessResponse(
        message="Chats parsed successfully",
        data={"count": len(chats), "chats": chats}
    )

@router.get("/parse-chats/{account_id}/with-messages", response_model=SuccessResponse)
async def parse_chats_with_messages_route(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Авторизуемся через Playwright и парсим список чатов с сообщениями.
    Возвращаем SuccessResponse при удаче.
    """
    # 1. Проверка аккаунта
    account = await db.execute_query(
        "SELECT id, login, encrypted_password FROM kwork_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE",
        (account_id, current_user["id"])
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # 2. Получаем клиент
    client = await client_manager.get_client(
        str(account["id"]),
        account["login"],
        account["encrypted_password"]
    )

    # 3. Аутентификация через Playwright
    logger.info(f"[chats/parse-with-msgs] Authenticating account {account['login']}")
    auth_ok = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
    if not auth_ok:
        logger.error(f"[chats/parse-with-msgs] Playwright auth failed for {account['login']}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    logger.info(f"[chats/parse-with-msgs] Auth successful, starting parse_chats_with_messages()")

    # 4. Парсинг чатов с сообщениями
    chats = await client.parse_chats_with_messages()

    logger.info(f"[chats/parse-with-msgs] Parsed {len(chats)} chats with messages")

    return SuccessResponse(
        message="Chats with messages parsed successfully",
        data={"count": len(chats), "chats": chats}
    )
