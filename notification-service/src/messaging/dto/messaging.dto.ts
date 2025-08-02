import { IsString, IsOptional, IsEnum, IsArray, IsObject, IsNumber, IsUUID, IsBoolean } from 'class-validator';

// === CHANNEL TYPES ===

export enum ChannelType {
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  SMS = 'sms'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  LOCATION = 'location',
  CONTACT = 'contact',
  STICKER = 'sticker'
}

export enum MessageStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

// === TELEGRAM DTOs ===

export class TelegramUserDto {
  @IsNumber()
  id: number;

  @IsOptional()
  @IsBoolean()
  is_bot?: boolean;

  @IsString()
  first_name: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  language_code?: string;
}

export class TelegramChatDto {
  @IsNumber()
  id: number;

  @IsString()
  type: string; // 'private', 'group', 'supergroup', 'channel'

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;
}

export class TelegramMessageDto {
  @IsNumber()
  message_id: number;

  @IsObject()
  from: TelegramUserDto;

  @IsObject()
  chat: TelegramChatDto;

  @IsNumber()
  date: number;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  entities?: any[];

  @IsOptional()
  @IsObject()
  reply_to_message?: TelegramMessageDto;

  @IsOptional()
  @IsArray()
  photo?: any[];

  @IsOptional()
  @IsObject()
  document?: any;

  @IsOptional()
  @IsObject()
  video?: any;

  @IsOptional()
  @IsObject()
  audio?: any;

  @IsOptional()
  @IsObject()
  voice?: any;

  @IsOptional()
  @IsObject()
  location?: any;

  @IsOptional()
  @IsObject()
  contact?: any;
}

export class TelegramWebhookDto {
  @IsNumber()
  update_id: number;

  @IsOptional()
  @IsObject()
  message?: TelegramMessageDto;

  @IsOptional()
  @IsObject()
  edited_message?: TelegramMessageDto;

  @IsOptional()
  @IsObject()
  callback_query?: any;
}

// === WHATSAPP DTOs ===

export class WhatsAppContactDto {
  @IsString()
  wa_id: string;

  @IsOptional()
  @IsString()
  profile?: any;
}

export class WhatsAppMessageDto {
  @IsString()
  id: string;

  @IsString()
  from: string; // Phone number

  @IsNumber()
  timestamp: number;

  @IsString()
  type: string; // 'text', 'image', 'video', 'audio', 'document', 'location', etc.

  @IsOptional()
  @IsObject()
  text?: {
    body: string;
  };

  @IsOptional()
  @IsObject()
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };

  @IsOptional()
  @IsObject()
  video?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };

  @IsOptional()
  @IsObject()
  audio?: {
    id: string;
    mime_type: string;
    sha256: string;
  };

  @IsOptional()
  @IsObject()
  document?: {
    id: string;
    filename: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };

  @IsOptional()
  @IsObject()
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };

  @IsOptional()
  @IsObject()
  contacts?: any[];

  @IsOptional()
  @IsObject()
  context?: {
    from: string;
    id: string;
  };
}

export class WhatsAppStatusDto {
  @IsString()
  id: string; // Message ID

  @IsString()
  status: string; // 'sent', 'delivered', 'read', 'failed'

  @IsNumber()
  timestamp: number;

  @IsString()
  recipient_id: string;

  @IsOptional()
  @IsArray()
  errors?: any[];
}

export class WhatsAppValueDto {
  @IsString()
  messaging_product: string;

  @IsString()
  metadata: any;

  @IsOptional()
  @IsArray()
  contacts?: WhatsAppContactDto[];

  @IsOptional()
  @IsArray()
  messages?: WhatsAppMessageDto[];

  @IsOptional()
  @IsArray()
  statuses?: WhatsAppStatusDto[];
}

export class WhatsAppChangeDto {
  @IsString()
  field: string;

  @IsObject()
  value: WhatsAppValueDto;
}

export class WhatsAppEntryDto {
  @IsString()
  id: string;

  @IsArray()
  changes: WhatsAppChangeDto[];
}

export class WhatsAppWebhookDto {
  @IsString()
  object: string;

  @IsArray()
  entry: WhatsAppEntryDto[];
}

// === MESSAGING DTOs ===

export class SendMessageDto {
  @IsEnum(ChannelType)
  channelType: ChannelType;

  @IsString()
  to: string; // Phone number, telegram chat_id, etc.

  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType = MessageType.TEXT;

  @IsOptional()
  @IsString()
  threadId?: string; // CRM thread ID

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsOptional()
  @IsArray()
  attachments?: any[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  senderId?: string; // Manager ID

  @IsOptional()
  @IsString()
  senderName?: string;
}

export class MessageDeliveryStatusDto {
  @IsEnum(MessageStatus)
  status: MessageStatus;

  @IsOptional()
  @IsString()
  externalId?: string; // External message ID from provider

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsNumber()
  timestamp?: number;
}

export class ChannelConfigDto {
  @IsUUID()
  tenantId: string;

  @IsUUID()
  managerId: string;

  @IsEnum(ChannelType)
  channelType: ChannelType;

  @IsString()
  externalId: string; // Phone number, telegram user_id

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>; // API keys, tokens, etc.
}

// === RESPONSE DTOs ===

export class MessageProcessingResult {
  success: boolean;
  messageId?: string;
  externalId?: string;
  error?: string;
  crmThreadId?: string;
  crmMessageId?: string;
}

export class ChannelAuthResult {
  success: boolean;
  channelId?: string;
  status?: string;
  error?: string;
  config?: Record<string, any>;
}

export class SendMessageResult {
  success: boolean;
  externalId?: string;
  messageId?: string;
  status?: MessageStatus;
  error?: string;
  deliveredAt?: Date;
}

// === INTERNAL PROCESSING DTOs ===

export class ProcessedMessageDto {
  tenantId: string;
  channelId: string;
  externalId: string;
  content: string;
  messageType: MessageType;
  senderExternalId: string;
  senderName?: string;
  sentAt: Date;
  attachments?: string; // JSON string
  metadata?: string; // JSON string
  replyToExternalId?: string;
}