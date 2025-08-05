from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from typing import List, Optional
import io
import logging

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.schemas import FileResponse, SuccessResponse
from ...utils.file_handler import FileHandler

file_handler = FileHandler()

logger = logging.getLogger(__name__)
router = APIRouter()
files_router = router

@router.post("/upload", response_model=FileResponse)
async def upload_file(
    file: UploadFile = File(...),
    category: str = Form("temp"),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Загрузка файла"""
    
    try:
        # Чтение содержимого файла
        file_content = await file.read()
        
        # Сохранение файла
        file_info = await file_handler.save_uploaded_file(
            file_content=file_content,
            filename=file.filename,
            user_id=current_user["id"],
            category=category
        )
        
        # Логирование
        await db.log_action(
            user_id=current_user["id"],
            account_id=None,
            action_type="file_upload",
            description=f"Uploaded file: {file.filename}"
        )
        
        logger.info(f"File uploaded by user {current_user['username']}: {file.filename}")
        
        return FileResponse(
            id=file_info["id"],
            filename=file_info["filename"],
            content_type=file_info["content_type"],
            file_size=file_info["file_size"],
            download_url=file_handler.get_file_download_url(file_info["id"]),
            expires_at=file_info.get("expires_at")
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file"
        )

@router.get("/", response_model=List[FileResponse])
async def get_my_files(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Получение списка файлов пользователя"""
    
    try:
        files = await file_handler.get_user_files(
            user_id=current_user["id"],
            category=category
        )
        
        file_responses = []
        for file_info in files:
            file_responses.append(FileResponse(
                id=str(file_info["id"]),
                filename=file_info["filename"],
                content_type=file_info["content_type"],
                file_size=file_info["file_size"],
                download_url=file_handler.get_file_download_url(str(file_info["id"])),
                expires_at=file_info["expires_at"]
            ))
        
        return file_responses
        
    except Exception as e:
        logger.error(f"Error fetching user files: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch files"
        )

@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Скачивание файла"""
    
    try:
        # Получение информации о файле
        file_info = await file_handler.get_file_info(file_id, current_user["id"])
        
        if not file_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or expired"
            )
        
        # Чтение файла
        file_content = await file_handler.read_file(file_id, current_user["id"])
        
        if not file_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File content not found"
            )
        
        # Логирование
        await db.log_action(
            user_id=current_user["id"],
            account_id=None,
            action_type="file_download",
            description=f"Downloaded file: {file_info['filename']}"
        )
        
        # Создание потока для скачивания
        file_stream = io.BytesIO(file_content)
        
        return StreamingResponse(
            io.BytesIO(file_content),
            media_type=file_info["content_type"],
            headers={
                "Content-Disposition": f"attachment; filename={file_info['filename']}"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading file {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download file"
        )

@router.delete("/{file_id}", response_model=SuccessResponse)
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Удаление файла"""
    
    try:
        # Получение информации о файле для логирования
        file_info = await file_handler.get_file_info(file_id, current_user["id"])
        
        if not file_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or expired"
            )
        
        # Удаление файла
        success = await file_handler.delete_file(file_id, current_user["id"])
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete file"
            )
        
        # Логирование
        await db.log_action(
            user_id=current_user["id"],
            account_id=None,
            action_type="file_delete",
            description=f"Deleted file: {file_info['filename']}"
        )
        
        logger.info(f"File deleted by user {current_user['username']}: {file_info['filename']}")
        
        return SuccessResponse(message="File deleted successfully")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting file {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file"
        )

@router.get("/{file_id}/info", response_model=FileResponse)
async def get_file_info(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Получение информации о файле"""
    
    try:
        file_info = await file_handler.get_file_info(file_id, current_user["id"])
        
        if not file_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or expired"
            )
        
        return FileResponse(
            id=str(file_info["id"]),
            filename=file_info["filename"],
            content_type=file_info["content_type"],
            file_size=file_info["file_size"],
            download_url=file_handler.get_file_download_url(file_id),
            expires_at=file_info["expires_at"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching file info {file_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch file info"
        )