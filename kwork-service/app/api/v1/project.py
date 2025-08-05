from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
import logging

from ...core.database import get_db
from ...services.kwork_client import client_manager
from ...services.kwork_client import KworkClient
logger = logging.getLogger(__name__)
router = APIRouter()
projects_router = router

from ...core.database import Database
@router.get("/parse/raw")
async def parse_and_save_projects(db: Database = Depends(get_db)):
    client = await client_manager.get_active_client()
    await client.parse_projects(db=db)
    return {"detail": "Парсинг и сохранение завершены"}


from ...core.database import Database
@router.get("/", response_model=List[dict])
async def get_saved_projects(db: Database = Depends(get_db)):
    query = "SELECT * FROM projects ORDER BY created_at DESC "
    rows = await db.execute_many(query)
    return rows
