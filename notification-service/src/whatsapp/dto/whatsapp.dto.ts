import { IsString, IsOptional, IsArray, IsObject, IsNotEmpty, IsPhoneNumber, Length, IsEnum, IsUrl } from 'class-validator';

/**
 * DTOs для WhatsApp Business API
 * Валидация входящих данных для работы с WhatsApp Business API
 */

// === MESSAGE SENDING DTOs ===

export class SendWhatsAppMessageDto {
  @IsNotEmpty()
  @IsString()
  @Length(10, 20)
  to: string; // Phone number in international format (e.g., "79001234567")

  @IsNotEmpty()
  @IsString()
  @Length(1, 4096)
  message: string;

  @IsOptional()
  @IsString()
  externalReference?: string; // Reference to CRM thread/message ID

  @IsOptional()
  @IsString()
  context?: string; // Reply to message ID for threading
}

export class SendTemplateMessageDto {
  @IsNotEmpty()
  @IsString()
  @Length(10, 20)
  to: string;

  @IsNotEmpty()
  @IsString()
  templateName: string;

  @IsOptional()
  @IsString()
  languageCode?: string; // Default: 'ru'

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parameters?: string[]; // Template parameters

  @IsOptional()
  @IsString()
  externalReference?: string;
}

export class SendMediaMessageDto {
  @IsNotEmpty()
  @IsString()
  @Length(10, 20)
  to: string;

  @IsNotEmpty()
  @IsUrl()
  mediaUrl: string;

  @IsNotEmpty()
  @IsEnum(['image', 'document', 'video', 'audio'])
  mediaType: 'image' | 'document' | 'video' | 'audio';

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  filename?: string; // For documents

  @IsOptional()
  @IsString()
  externalReference?: string;
}

// === WEBHOOK DTOs ===

export class WhatsAppWebhookDto {
  @IsNotEmpty()
  @IsString()
  object: string; // Should be "whatsapp_business_account"

  @IsNotEmpty()
  @IsArray()
  entry: WhatsAppWebhookEntryDto[];
}

export class WhatsAppWebhookEntryDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsArray()
  changes: WhatsAppWebhookChangeDto[];
}

export class WhatsAppMetadataDto {
  @IsNotEmpty()
  @IsString()
  display_phone_number: string;

  @IsNotEmpty()
  @IsString()
  phone_number_id: string;
}

export class WhatsAppWebhookValueDto {
  @IsNotEmpty()
  @IsString()
  messaging_product: string; // "whatsapp"

  @IsNotEmpty()
  @IsObject()
  metadata: WhatsAppMetadataDto;

  @IsOptional()
  @IsArray()
  messages?: WhatsAppIncomingMessageDto[];

  @IsOptional()
  @IsArray()
  statuses?: WhatsAppMessageStatusDto[];
}

export class WhatsAppWebhookChangeDto {
  @IsNotEmpty()
  @IsString()
  field: string; // "messages" or "message_status"

  @IsNotEmpty()
  @IsObject()
  value: WhatsAppWebhookValueDto;
}

export class WhatsAppMediaDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  mime_type?: string;

  @IsOptional()
  @IsString()
  sha256?: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class WhatsAppDocumentDto extends WhatsAppMediaDto {
  @IsOptional()
  @IsString()
  filename?: string;
}

export class WhatsAppInteractiveDto {
  @IsNotEmpty()
  @IsEnum(['button_reply', 'list_reply'])
  type: 'button_reply' | 'list_reply';

  @IsOptional()
  @IsObject()
  button_reply?: {
    id: string;
    title: string;
  };

  @IsOptional()
  @IsObject()
  list_reply?: {
    id: string;
    title: string;
    description?: string;
  };
}

export class WhatsAppIncomingMessageDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsString()
  from: string;

  @IsNotEmpty()
  @IsString()
  timestamp: string;

  @IsNotEmpty()
  @IsEnum(['text', 'image', 'document', 'voice', 'video', 'audio', 'button', 'interactive', 'system'])
  type: 'text' | 'image' | 'document' | 'voice' | 'video' | 'audio' | 'button' | 'interactive' | 'system';

  @IsOptional()
  @IsObject()
  text?: {
    body: string;
  };

  @IsOptional()
  @IsObject()
  image?: WhatsAppMediaDto;

  @IsOptional()
  @IsObject()
  document?: WhatsAppDocumentDto;

  @IsOptional()
  @IsObject()
  voice?: WhatsAppMediaDto;

  @IsOptional()
  @IsObject()
  video?: WhatsAppMediaDto;

  @IsOptional()
  @IsObject()
  audio?: WhatsAppMediaDto;

  @IsOptional()
  @IsObject()
  button?: {
    text: string;
    payload: string;
  };

  @IsOptional()
  @IsObject()
  interactive?: WhatsAppInteractiveDto;

  @IsOptional()
  @IsObject()
  context?: {
    from: string;
    id: string;
    frequently_forwarded?: boolean;
    forwarded?: boolean;
  };

  @IsOptional()
  @IsObject()
  system?: {
    body: string;
    type: string;
  };
}

export class WhatsAppMessageStatusDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsEnum(['sent', 'delivered', 'read', 'failed'])
  status: 'sent' | 'delivered' | 'read' | 'failed';

  @IsNotEmpty()
  @IsString()
  timestamp: string;

  @IsNotEmpty()
  @IsString()
  recipient_id: string;

  @IsOptional()
  @IsArray()
  errors?: WhatsAppErrorDto[];

  @IsOptional()
  @IsObject()
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };

  @IsOptional()
  @IsObject()
  conversation?: {
    id: string;
    expiration_timestamp?: string;
    origin?: {
      type: string;
    };
  };
}

export class WhatsAppErrorDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsObject()
  error_data?: {
    details: string;
  };
}

// === RESPONSE DTOs ===

export class WhatsAppMessageResponseDto {
  success: boolean;
  messageId?: string;
  whatsappId?: string;
  status?: string;
  timestamp?: string;
  message: string;
  error?: string;
}

export class WhatsAppWebhookResponseDto {
  success: boolean;
  message: string;
  processed?: {
    messages: number;
    statuses: number;
  };
  errors?: string[];
}

export class WhatsAppHealthResponseDto {
  success: boolean;
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  configuration: {
    hasAccessToken: boolean;
    hasPhoneNumberId: boolean;
    hasVerifyToken: boolean;
    environment: string;
  };
  errors?: string[];
}

// === TEMPLATE DTOs ===

export class WhatsAppTemplateDto {
  name: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY';
  components: WhatsAppTemplateComponentDto[];
}

export class WhatsAppTemplateComponentDto {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
  };
  buttons?: WhatsAppTemplateButtonDto[];
}

export class WhatsAppTemplateButtonDto {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

// === TEST DTOs (for development) ===

export class TestWhatsAppWebhookDto {
  @IsOptional()
  @IsString()
  from?: string; // Default: test phone number

  @IsOptional()
  @IsString()
  message?: string; // Default: test message

  @IsOptional()
  @IsEnum(['text', 'image', 'document'])
  messageType?: 'text' | 'image' | 'document';

  @IsOptional()
  @IsString()
  phoneNumberId?: string; // Default: test phone number ID
}