import { IsString, IsOptional, IsEnum, IsNumber, IsPhoneNumber, Length, IsNotEmpty } from 'class-validator';

/**
 * DTOs для Telegram User API
 * Валидация входящих данных для работы с пользовательским API Telegram
 */

// === AUTHENTICATION DTOs ===

export class InitiateAuthDto {
  @IsNotEmpty()
  @IsString()
  @Length(10, 20)
  phoneNumber: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  systemVersion?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  langCode?: string;
}

export class CompleteAuthDto {
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @IsNotEmpty()
  @IsString()
  @Length(5, 6)
  code: string;

  @IsOptional()
  @IsString()
  password?: string; // For 2FA
}

// === MESSAGE DTOs ===

export enum ParseMode {
  HTML = 'HTML',
  MARKDOWN = 'Markdown'
}

export class SendUserMessageDto {
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @IsNotEmpty()
  chatId: string | number; // Can be username (@username) or user ID

  @IsNotEmpty()
  @IsString()
  @Length(1, 4096)
  message: string;

  @IsOptional()
  @IsEnum(ParseMode)
  parseMode?: ParseMode;

  @IsOptional()
  @IsNumber()
  replyToMessageId?: number;

  @IsOptional()
  @IsString()
  externalReference?: string; // Reference to CRM thread/message ID
}

// === CHAT DTOs ===

export class GetChatsDto {
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  offset?: number;

  @IsOptional()
  @IsString()
  searchQuery?: string;
}

// === SESSION DTOs ===

export class SessionInfoDto {
  id: string;
  phoneNumber: string;
  userId?: number;
  isAuthenticated: boolean;
  isConnected: boolean;
  lastActivity: Date;
  deviceInfo?: {
    model?: string;
    version?: string;
    appVersion?: string;
  };
}

export class CreateSessionDto {
  @IsNotEmpty()
  @IsString()
  @Length(10, 20)
  phoneNumber: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  systemVersion?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  description?: string; // Human-readable description for this session
}

// === LISTENER DTOs ===

export class StartListenerDto {
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @IsOptional()
  @IsString()
  crmWebhookUrl?: string; // URL to send incoming messages to CRM

  @IsOptional()
  filterPrivateChats?: boolean;

  @IsOptional()
  filterGroupChats?: boolean;

  @IsOptional()
  @IsString()
  filterKeywords?: string; // Comma-separated keywords to filter
}

// === RESPONSE DTOs ===

export class AuthInitiatedResponseDto {
  success: boolean;
  sessionId: string;
  codeSent: boolean;
  message: string;
  phoneCodeHash?: string; // For MTProto
}

export class AuthCompletedResponseDto {
  success: boolean;
  session: SessionInfoDto;
  message: string;
  user?: {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
    phoneNumber: string;
  };
}

export class MessageSentResponseDto {
  success: boolean;
  messageId: number;
  sentAt: string;
  message: string;
  chatInfo?: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  };
}

export class ChatInfoDto {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  memberCount?: number;
  description?: string;
  lastMessage?: {
    id: number;
    text: string;
    date: number;
    fromUser: boolean;
  };
}

export class GetChatsResponseDto {
  success: boolean;
  chats: ChatInfoDto[];
  count: number;
  hasMore?: boolean;
  nextOffset?: number;
}

// === ERROR DTOs ===

export class TelegramUserErrorDto {
  success: false;
  error: string;
  code?: string;
  details?: any;
  timestamp: string;
}

// === WEBHOOK DTOs (for incoming messages) ===

export class IncomingMessageDto {
  sessionId: string;
  messageId: number;
  chatId: number;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  fromUserId: number;
  fromUsername?: string;
  fromFirstName?: string;
  fromLastName?: string;
  text?: string;
  date: number;
  replyToMessageId?: number;
  forwardFrom?: {
    userId: number;
    firstName?: string;
    lastName?: string;
    username?: string;
  };
  media?: {
    type: 'photo' | 'video' | 'document' | 'voice' | 'audio' | 'sticker';
    fileId: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  };
}

// === TEST DTOs (for development) ===

export class TestMockMessageDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsNotEmpty()
  @IsString()
  chatId: string;

  @IsOptional()
  @IsString()
  chatType?: 'private' | 'group';

  @IsOptional()
  @IsString()
  fromFirstName?: string;

  @IsOptional()
  @IsString()
  fromLastName?: string;

  @IsOptional()
  @IsString()
  fromUsername?: string;
}