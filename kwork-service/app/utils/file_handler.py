import os
import uuid
import aiofiles
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import mimetypes
import logging

from ..core.config import settings
from ..core.database import get_db

logger = logging.getLogger(__name__)

class FileHandler:
    """Безопасный обработчик файлов с проверками и ограничениями"""
    
    def __init__(self):
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Создание подкаталогов
        (self.upload_dir / "temp").mkdir(exist_ok=True)
        (self.upload_dir / "chat").mkdir(exist_ok=True)
        (self.upload_dir / "orders").mkdir(exist_ok=True)
    
    def _is_allowed_file(self, filename: str) -> bool:
        """Проверка разрешенного типа файла"""
        file_ext = Path(filename).suffix.lower()
        return file_ext in settings.ALLOWED_FILE_TYPES
    
    def _get_safe_filename(self, filename: str) -> str:
        """Создание безопасного имени файла"""
        # Удаление опасных символов
        safe_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_"
        safe_filename = "".join(c for c in filename if c in safe_chars)
        
        # Ограничение длины
        if len(safe_filename) > 100:
            name, ext = os.path.splitext(safe_filename)
            safe_filename = name[:95] + ext
        
        # Добавление UUID для уникальности
        name, ext = os.path.splitext(safe_filename)
        unique_id = str(uuid.uuid4())[:8]
        
        return f"{name}_{unique_id}{ext}"
    
    def _get_file_expiration(self, category: str) -> datetime:
        """Получение времени истечения файла в зависимости от категории"""
        if category == "temp":
            # Временные файлы живут 1 день
            return datetime.now() + timedelta(days=1)
        elif category == "chat":
            # Файлы чатов живут 30 дней
            return datetime.now() + timedelta(days=30)
        elif category == "orders":
            # Файлы заказов живут 90 дней
            return datetime.now() + timedelta(days=90)
        else:
            # По умолчанию 7 дней
            return datetime.now() + timedelta(days=7)
    
    async def save_uploaded_file(self, file_content: bytes, filename: str, 
                               user_id: int, category: str = "temp") -> Dict[str, Any]:
        """Сохранение загруженного файла"""
        
        # Проверка размера файла
        if len(file_content) > settings.MAX_FILE_SIZE:
            raise ValueError(f"File size exceeds maximum allowed size of {settings.MAX_FILE_SIZE} bytes")
        
        # Проверка типа файла
        if not self._is_allowed_file(filename):
            raise ValueError(f"File type not allowed. Allowed types: {', '.join(settings.ALLOWED_FILE_TYPES)}")
        
        # Создание безопасного имени файла
        safe_filename = self._get_safe_filename(filename)
        
        # Определение пути для сохранения
        category_dir = self.upload_dir / category
        category_dir.mkdir(exist_ok=True)
        
        file_path = category_dir / safe_filename
        
        # Сохранение файла
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_content)
        
        # Определение MIME типа
        content_type, _ = mimetypes.guess_type(str(file_path))
        if not content_type:
            content_type = "application/octet-stream"
        
        # Сохранение информации о файле в БД
        db = await get_db()
        file_id = await db.execute_insert(
            """INSERT INTO temp_files 
               (user_id, filename, filepath, file_size, content_type, expires_at) 
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                filename,
                str(file_path),
                len(file_content),
                content_type,
                self._get_file_expiration(category)
            )
        )
        
        logger.info(f"File saved: {filename} -> {safe_filename} for user {user_id}")
        
        return {
            "id": str(file_id),
            "filename": filename,
            "safe_filename": safe_filename,
            "filepath": str(file_path),
            "file_size": len(file_content),
            "content_type": content_type,
            "category": category,
            "expires_at": self._get_file_expiration(category)
        }
    
    async def get_file_info(self, file_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        """Получение информации о файле"""
        db = await get_db()
        
        file_info = await db.execute_query(
            """SELECT * FROM temp_files 
               WHERE id = $1 AND user_id = $2 AND expires_at > $3""",
            (file_id, user_id, datetime.now())
        )
        
        if not file_info:
            return None
        
        return {
            "id": file_info["id"],
            "filename": file_info["filename"],
            "filepath": file_info["filepath"],
            "file_size": file_info["file_size"],
            "content_type": file_info["content_type"],
            "created_at": file_info["created_at"],
            "expires_at": file_info["expires_at"]
        }
    
    async def read_file(self, file_id: str, user_id: int) -> Optional[bytes]:
        """Чтение файла"""
        file_info = await self.get_file_info(file_id, user_id)
        
        if not file_info:
            return None
        
        file_path = Path(file_info["filepath"])
        
        if not file_path.exists():
            logger.warning(f"File not found: {file_path}")
            return None
        
        try:
            async with aiofiles.open(file_path, 'rb') as f:
                return await f.read()
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            return None
    
    async def delete_file(self, file_id: str, user_id: int) -> bool:
        """Удаление файла"""
        file_info = await self.get_file_info(file_id, user_id)
        
        if not file_info:
            return False
        
        file_path = Path(file_info["filepath"])
        
        try:
            # Удаление файла с диска
            if file_path.exists():
                file_path.unlink()
            
            # Удаление записи из БД
            db = await get_db()
            await db.execute_update(
                "DELETE FROM temp_files WHERE id = $1 AND user_id = $2",
                (file_id, user_id)
            )
            
            logger.info(f"File deleted: {file_id} for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting file {file_id}: {e}")
            return False
    
    async def cleanup_expired_files(self):
        """Очистка истекших файлов"""
        db = await get_db()
        
        # Получение истекших файлов
        expired_files = await db.execute_many(
            "SELECT * FROM temp_files WHERE expires_at < $1",
            (datetime.now(),)
        )
        
        deleted_count = 0
        
        for file_info in expired_files:
            file_path = Path(file_info["filepath"])
            
            try:
                # Удаление файла с диска
                if file_path.exists():
                    file_path.unlink()
                
                deleted_count += 1
                
            except Exception as e:
                logger.error(f"Error deleting expired file {file_path}: {e}")
        
        # Удаление записей из БД
        await db.execute_update(
            "DELETE FROM temp_files WHERE expires_at < $1",
            (datetime.now(),)
        )
        
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} expired files")
    
    async def get_user_files(self, user_id: int, category: str = None) -> List[Dict[str, Any]]:
        """Получение файлов пользователя"""
        db = await get_db()
        
        query = """SELECT * FROM temp_files 
                   WHERE user_id = $1 AND expires_at > $2"""
        params = [user_id, datetime.now()]
        
        if category:
            # Фильтрация по категории через путь (простая реализация)
            query += " AND filepath LIKE $3"
            params.append(f"%/{category}/%")
        
        query += " ORDER BY created_at DESC"
        
        files = await db.execute_many(query, tuple(params))
        
        return [
            {
                "id": file_info["id"],
                "filename": file_info["filename"],
                "file_size": file_info["file_size"],
                "content_type": file_info["content_type"],
                "created_at": file_info["created_at"],
                "expires_at": file_info["expires_at"]
            }
            for file_info in files
        ]
    
    def get_file_download_url(self, file_id: str) -> str:
        """Генерация URL для скачивания файла"""
        return f"/api/v1/files/{file_id}/download"

# Глобальный экземпляр обработчика файлов
file_handler = FileHandler()