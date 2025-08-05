from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from typing import List, Optional
import logging

from ...core.database import get_db
from ...core.security import get_current_user
from ...core.auth_middleware import require_tenant_access
from ...core.crm_integration import crm_integration
from ...models.schemas import (
    OrderFilter,
    OrderResponse,
    OrderResponseCreate,
    OrderStageUpdate,
    OrderDelivery,
    SuccessResponse,
    PaginatedResponse
)

from ...services.kwork_client import client_manager


logger = logging.getLogger(__name__)
router = APIRouter()
orders_router = router

@router.get("/", response_model=PaginatedResponse)
async def get_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    search: Optional[str] = Query(None),
    create_leads: bool = Query(False, description="Создавать лиды в CRM из заказов"),
    current_user: dict = Depends(get_current_user),
    tenant_id: str = Depends(require_tenant_access),
    db = Depends(get_db)
):
    """Получение списка заказов с опциональным созданием лидов в CRM"""
    
    # Получение активного клиента
    client = await client_manager.get_active_client()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Kwork account. Please switch to an account first."
        )
    
    if not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kwork account not authenticated"
        )
    
    # Подготовка фильтров
    filters = {}
    if category:
        filters["category"] = category
    if min_price is not None:
        filters["min_price"] = min_price
    if max_price is not None:
        filters["max_price"] = max_price
    if search:
        filters["search"] = search
    
    try:
        # Получение заказов через Kwork API
        orders_data = await client.get_orders(
            page=page,
            limit=limit,
            filters=filters
        )
        
        orders = []
        created_leads = []
        
        for order_data in orders_data.get("orders", []):
            order_response = OrderResponse(
                id=order_data["id"],
                title=order_data["title"],
                description=order_data["description"],
                category=order_data["category"],
                price=order_data["price"],
                currency=order_data.get("currency", "RUB"),
                deadline=order_data.get("deadline"),
                client_rating=order_data.get("client_rating"),
                responses_count=order_data.get("responses_count", 0),
                created_at=order_data["created_at"]
            )
            orders.append(order_response)
            
            # Создание лида в CRM если запрошено
            if create_leads:
                try:
                    lead = await crm_integration.create_lead_from_kwork_order(order_data, tenant_id)
                    if lead:
                        created_leads.append({
                            "order_id": order_data["id"],
                            "lead_id": lead["id"],
                            "lead_name": lead["name"]
                        })
                        logger.info(f"Created lead {lead['id']} from Kwork order {order_data['id']}")
                except Exception as e:
                    logger.error(f"Failed to create lead from order {order_data['id']}: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="orders_view",
            description=f"Viewed orders page {page}"
        )
        
        response = PaginatedResponse(
            items=orders,
            page=page,
            limit=limit,
            total=orders_data.get("total", len(orders)),
            pages=orders_data.get("pages", 1)
        )
        
        # Добавляем информацию о созданных лидах в ответ
        if create_leads and created_leads:
            response.metadata = {"created_leads": created_leads}
        
        return response
        
    except Exception as e:
        logger.error(f"Error getting orders: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get orders"
        )

# @router.get("/{order_id}", response_model=OrderResponse)
# async def get_order(
#     order_id: str,
#     current_user: dict = Depends(get_current_user),
#     db = Depends(get_db)
# ):
#     """Получение детальной информации о заказе"""
#
#     client = await client_manager.get_active_client()
#
#     if not client:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="No active Kwork account"
#         )
#
#     if not client.is_authenticated:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Kwork account not authenticated"
#         )
#
#     try:
#         # Получение детальной информации о заказе
#         order_data = await client.get_order_details(order_id)
#
#         order = OrderResponse(
#             id=order_data["id"],
#             title=order_data["title"],
#             description=order_data["description"],
#             category=order_data["category"],
#             price=order_data["price"],
#             currency=order_data.get("currency", "RUB"),
#             deadline=order_data.get("deadline"),
#             client_rating=order_data.get("client_rating"),
#             responses_count=order_data.get("responses_count", 0),
#             created_at=order_data["created_at"]
#         )
#
#         await db.log_action(
#             user_id=current_user["id"],
#             account_id=int(client.account_id),
#             action_type="order_view",
#             description=f"Viewed order {order_id}"
#         )
#
#         return order
#
#     except Exception as e:
#         logger.error(f"Error fetching order {order_id}: {e}")
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Failed to fetch order: {str(e)}"
#         )

@router.post("/{order_id}/respond", response_model=SuccessResponse)
async def respond_to_order(
    order_id: str,
    response_data: OrderResponseCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Отклик на заказ"""
    
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
        # Отправка отклика через Kwork API
        result = await client.respond_to_order(
            order_id=order_id,
            message=response_data.message,
            price=response_data.price,
            files=response_data.files
        )
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="order_respond",
            description=f"Responded to order {order_id}"
        )
        
        logger.info(f"User {current_user['username']} responded to order {order_id}")
        
        return SuccessResponse(
            message="Response sent successfully",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error responding to order {order_id}: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="order_respond_failed",
            description=f"Failed to respond to order {order_id}: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send response: {str(e)}"
        )

@router.patch("/{order_id}/stage", response_model=SuccessResponse)
async def update_order_stage(
    order_id: str,
    stage_data: OrderStageUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Обновление этапа заказа"""
    
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
        # Обновление этапа заказа
        result = await client.update_order_stage(
            order_id=order_id,
            stage=stage_data.stage,
            message=stage_data.message,
            files=stage_data.files
        )
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="order_stage_update",
            description=f"Updated stage for order {order_id} to {stage_data.stage}"
        )
        
        logger.info(f"User {current_user['username']} updated stage for order {order_id}")
        
        return SuccessResponse(
            message="Order stage updated successfully",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error updating stage for order {order_id}: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="order_stage_update_failed",
            description=f"Failed to update stage for order {order_id}: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update order stage: {str(e)}"
        )

@router.post("/{order_id}/deliver", response_model=SuccessResponse)
async def deliver_order(
    order_id: str,
    delivery_data: OrderDelivery,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Сдача заказа"""
    
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
        # Сдача заказа
        result = await client.deliver_order(
            order_id=order_id,
            message=delivery_data.message,
            files=delivery_data.files
        )
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id),
            action_type="order_deliver",
            description=f"Delivered order {order_id}"
        )
        
        logger.info(f"User {current_user['username']} delivered order {order_id}")
        
        return SuccessResponse(
            message="Order delivered successfully",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error delivering order {order_id}: {e}")
        
        await db.log_action(
            user_id=current_user["id"],
            account_id=int(client.account_id) if client else None,
            action_type="order_deliver_failed",
            description=f"Failed to deliver order {order_id}: {str(e)}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to deliver order: {str(e)}"
        )

# @router.get("/my/active", response_model=List[OrderResponse])
# async def get_my_active_orders(
#     current_user: dict = Depends(get_current_user),
#     db = Depends(get_db)
# ):
#     """Получение активных заказов пользователя"""
#
#     client = await client_manager.get_active_client()
#
#     if not client:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="No active Kwork account"
#         )
#
#     if not client.is_authenticated:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Kwork account not authenticated"
#         )
#
#     try:
#         # Получение активных заказов
#         orders_data = await client.get_my_active_orders()
#
#         orders = []
#         for order_data in orders_data.get("orders", []):
#             orders.append(OrderResponse(
#                 id=order_data["id"],
#                 title=order_data["title"],
#                 description=order_data["description"],
#                 category=order_data["category"],
#                 price=order_data["price"],
#                 currency=order_data.get("currency", "RUB"),
#                 deadline=order_data.get("deadline"),
#                 client_rating=order_data.get("client_rating"),
#                 responses_count=order_data.get("responses_count", 0),
#                 created_at=order_data["created_at"]
#             ))
#
#         await db.log_action(
#             user_id=current_user["id"],
#             account_id=int(client.account_id),
#             action_type="my_orders_view",
#             description="Viewed my active orders"
#         )
#
#         return orders
#
#     except Exception as e:
#         logger.error(f"Error fetching my active orders: {e}")
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Failed to fetch my active orders: {str(e)}"
#         )
from ...services.kwork_client import KworkClient

@router.get("/my/active", response_model=List[OrderResponse])
async def get_my_active_orders(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение активных заказов пользователя"""
    logger.info(f"[get_my_active_orders] user_id={current_user['id']}")

    client = await client_manager.get_active_client()
    if not client or not client.is_authenticated:
        logger.warning("[get_my_active_orders] No active or authenticated client")
        raise HTTPException(status_code=401, detail="Kwork account not authenticated")

    result = await client.get_my_active_orders()
    if not result["success"]:
        logger.error(f"[get_my_active_orders] Parsing error: {result['error']}")
        raise HTTPException(status_code=500, detail=result["error"])

    orders = [
        OrderResponse(
            id=o["id"],
            title=o["title"],
            description=None,
            category=None,
            price=o.get("price"),
            currency=o.get("currency", "RUB"),
            deadline=o.get("time_left"),
            client_rating=None,
            responses_count=0,
            created_at=o.get("created_at")
        )
        for o in result["data"]
    ]

    await db.log_action(
        user_id=current_user["id"],
        account_id=int(client.account_id),
        action_type="my_orders_view",
        description="Viewed my active orders"
    )
    logger.info(f"[get_my_active_orders] Returned {len(orders)} orders")
    return orders

from ...services.kwork_client import KworkClient
# @router.get("/parse", response_model=List[OrderResponse])
# async def parse_orders(
#     current_user: dict = Depends(get_current_user),
#     db=Depends(get_db)
# ):
#     """Парсинг заказов с Kwork вручную (авторизация через playwright + парсинг через selenium)"""
#
#     try:
#         # Получаем аккаунт из БД (пример)
#         account = await db.fetch_one(
#             "SELECT * FROM kwork_accounts WHERE user_id = :uid AND is_active = 1 LIMIT 1",
#             {"uid": current_user["id"]}
#         )
#         if not account:
#             raise HTTPException(status_code=404, detail="Аккаунт не найден")
#
#         # Авторизация через Playwright (получаем cookies)
#         cookies = await authenticate_with_playwright(
#             login=account["login"],
#             password=account["password"]  # пароль должен быть расшифрован
#         )
#
#         # Настройка Selenium
#         options = Options()
#         options.add_argument("--headless")
#         options.add_argument("--no-sandbox")
#         options.add_argument("--disable-dev-shm-usage")
#         driver = webdriver.Chrome(service=Service(), options=options)
#         driver.get("https://kwork.ru")  # Стартовая страница для установки cookies
#
#         # Установка cookies
#         for cookie in cookies:
#             cookie_dict = {
#                 "name": cookie["name"],
#                 "value": cookie["value"],
#                 "domain": cookie.get("domain", "kwork.ru"),
#                 "path": cookie.get("path", "/"),
#             }
#             if "expiry" in cookie:
#                 cookie_dict["expiry"] = cookie["expiry"]
#             driver.add_cookie(cookie_dict)
#
#         all_orders = []
#         seen_ids = set()
#         page = 1
#         empty_pages = 0
#         max_empty_pages = 2
#
#         while True:
#             driver.get(f"https://kwork.ru/orders?c=active&page={page}")
#             time.sleep(2)
#
#             soup = BeautifulSoup(driver.page_source, "html.parser")
#             rows = soup.select("div.order-list-table tbody tr")
#
#             if not rows:
#                 empty_pages += 1
#                 if empty_pages >= max_empty_pages:
#                     break
#                 else:
#                     page += 1
#                     continue
#
#             for row in rows:
#                 order = parse_order_row(row)
#                 if order["id"] not in seen_ids:
#                     seen_ids.add(order["id"])
#                     all_orders.append(order)
#
#             page += 1
#
#         driver.quit()
#
#         # Преобразуем в response_model
#         return [
#             OrderResponse(
#                 id=order["id"],
#                 title=order["title"],
#                 description="",
#                 category="Other",
#                 price=order.get("price", 0),
#                 currency="RUB",
#                 deadline=order.get("time_left", ""),
#                 client_rating=None,
#                 responses_count=0,
#                 created_at=None
#             )
#             for order in all_orders
#         ]
#
#     except Exception as e:
#         logger.error(f"Error parsing orders manually: {e}")
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Failed to parse orders: {str(e)}"
#         )
import asyncio
@router.get("/parse/{account_id}", response_model=SuccessResponse)
async def parse_orders_with_auth(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Авторизуемся через Playwright и парсим заказы.
    Возвращаем SuccessResponse при удаче.
    """
    # Шаг 1: проверяем, что аккаунт у пользователя есть и активен
    account = await db.execute_query(
        "SELECT id, login, encrypted_password FROM kwork_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE",
        (account_id, current_user["id"])
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Шаг 2: инициализируем клиент
    client = await client_manager.get_client(
        str(account["id"]),
        account["login"],
        account["encrypted_password"]
    )

    # Шаг 3: аутентификация через Playwright
    logger.info(f"[orders/parse] Authenticating account {account['login']}")
    auth_ok = await client.authenticate_with_playwright(show_browser=False, force_new_auth=False)
    if not auth_ok:
        logger.error(f"[orders/parse] Playwright auth failed for {account['login']}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    logger.info(f"[orders/parse] Auth successful, starting parse_orders()")

    # Шаг 4: запускаем синхронный метод парсинга (если он не async) в пуле потоков
    loop = asyncio.get_event_loop()
    # orders = await loop.run_in_executor(None, client.parse_orders)
    orders = await client.parse_orders()

    await client.save_orders_to_db(db, current_user["id"], account_id, orders)

    logger.info(f"[orders/parse] Parsed {len(orders)} orders")

    return SuccessResponse(
        message="Orders parsed successfully",
        data={"count": len(orders), "orders": orders}
    )
from ...core.database import Database
from ...models.schemas import ParsedOrder
import json


@router.get("/orders/{account_id}", response_model=List[ParsedOrder])
async def get_orders_by_account(account_id: int, db: Database = Depends(get_db)):
    rows = await db.execute_many("""
        SELECT id, title, url, buyer_name, buyer_url, ordered_at, time_left,
               price, status, message, duration, files
        FROM orders
        WHERE account_id = ?
        ORDER BY ordered_at DESC
    """, (account_id,))

    orders = []
    for row in rows:
        # Преобразуем строку files в список
        files = json.loads(row["files"]) if row["files"] else []
        orders.append(ParsedOrder(
            id=row["id"],
            title=row["title"],
            url=row["url"],
            buyer_name=row["buyer_name"],
            buyer_url=row["buyer_url"],
            ordered_at=row["ordered_at"],
            time_left=row["time_left"],
            price=row["price"],
            status=row["status"],
            message=row["message"],
            duration=row["duration"],
            files=files
        ))

    return orders
