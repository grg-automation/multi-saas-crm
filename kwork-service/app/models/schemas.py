from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    created_at: datetime

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    username: Optional[str] = None

class KworkAccountCreate(BaseModel):
    login: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=1, max_length=255)
    account_name: Optional[str] = Field(None, max_length=100)
class ParsedOrder(BaseModel):
    id: str
    title: str
    url: str
    buyer_name: Optional[str]
    buyer_url: Optional[str]
    ordered_at: Optional[str]
    time_left: Optional[str]
    price: Optional[int]
    status: Optional[str]
    message: Optional[str]
    files: List[Dict[str, str]] = Field(default_factory=list)
    duration: Optional[str]

class KworkAccountResponse(BaseModel):
    id: int
    login: str
    account_name: Optional[str]
    is_active: bool
    last_login: Optional[datetime]
    created_at: datetime

class KworkAccountSwitch(BaseModel):
    account_id: int

class OrderFilter(BaseModel):
    category: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    search: Optional[str] = None
class ProjectResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    price: Optional[int]
    price_max: Optional[int]
    buyer_username: Optional[str]
    buyer_rating: Optional[int] = None  # Пока нет
    projects_posted: Optional[int]
    hire_rate: Optional[float]
    proposals_count: Optional[int]
    time_left: Optional[str]
    is_viewed: bool

class OrderResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    price: float
    currency: str
    deadline: Optional[datetime]
    client_rating: Optional[float]
    responses_count: int
    created_at: datetime

class OrderResponseCreate(BaseModel):
    message: str = Field(..., min_length=10, max_length=5000)
    price: Optional[float] = Field(None, ge=0)
    files: Optional[List[str]] = []
    
    @validator('files')
    def validate_files(cls, v):
        if v and len(v) > 10:
            raise ValueError('Maximum 10 files allowed')
        return v

class ChatMessageResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    message: str
    files: Optional[List[str]] = []
    timestamp: datetime
    is_read: bool

class ChatMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    files: Optional[List[str]] = []
    
    @validator('files')
    def validate_files(cls, v):
        if v and len(v) > 5:
            raise ValueError('Maximum 5 files allowed per message')
        return v

class QuarkStage(BaseModel):
    title: str = Field(..., min_length=5, max_length=200)
    description: str = Field(..., min_length=10, max_length=1000)
    price: float = Field(..., gt=0)
    deadline_days: int = Field(..., ge=1, le=30)

class QuarkCreate(BaseModel):
    title: str = Field(..., min_length=10, max_length=200)
    description: str = Field(..., min_length=50, max_length=5000)
    category: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0)
    stages: List[QuarkStage] = Field(..., min_items=1, max_items=10)

class QuarkResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    price: float
    stages: List[QuarkStage]
    status: str
    created_at: datetime

class GigUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=10, max_length=200)
    description: Optional[str] = Field(None, min_length=50, max_length=5000)
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    tags: Optional[List[str]] = Field(None, max_items=20)
    
    @validator('tags')
    def validate_tags(cls, v):
        if v:
            for tag in v:
                if len(tag) < 2 or len(tag) > 50:
                    raise ValueError('Tag length must be between 2 and 50 characters')
        return v

class GigResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    price: float
    currency: str
    rating: Optional[float]
    reviews_count: int
    orders_count: int
    tags: List[str]
    is_active: bool
    created_at: datetime

class FileUpload(BaseModel):
    filename: str
    content_type: str
    file_size: int

class FileResponse(BaseModel):
    id: str
    filename: str
    content_type: str
    file_size: int
    download_url: str
    expires_at: datetime

class RateLimitInfo(BaseModel):
    general: int
    messages: int
    responses: int
    gig_edits: int
    auth: int

class ErrorResponse(BaseModel):
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None

class SuccessResponse(BaseModel):
    success: bool = True
    message: str
    data: Optional[Dict[str, Any]] = None

class PaginatedResponse(BaseModel):
    items: List[Any]
    page: int
    limit: int
    total: int
    pages: int

class OrderStatusEnum(str, Enum):
    ACTIVE = "active"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class OrderStageUpdate(BaseModel):
    stage: str
    message: Optional[str] = None
    files: Optional[List[str]] = []

class OrderDelivery(BaseModel):
    message: str = Field(..., min_length=10, max_length=2000)
    files: List[str] = Field(..., min_items=1, max_items=5)

class AccountInfo(BaseModel):
    id: str
    username: str
    display_name: Optional[str]
    full_name: Optional[str]
    avatar_url: Optional[str]
    location: Optional[str]
    joined: Optional[str]
    is_online: bool
    profession: Optional[str]
    about_me: Optional[str]
    skills: List[str] = Field(default_factory=list)
    last_seen: Optional[datetime]
