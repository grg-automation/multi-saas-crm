package com.backend.core.messaging

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import java.time.LocalDateTime
import java.util.*

// === CHANNEL DTOs ===

data class ChannelDto(
    val id: UUID,
    val tenantId: UUID,
    val type: ChannelType,
    val externalId: String,
    val managerId: UUID,
    val status: ChannelStatus,
    val displayName: String?,
    val isActive: Boolean,
    val lastActivityAt: LocalDateTime?,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime
)

data class CreateChannelRequest(
    @field:NotNull
    val type: ChannelType,
    
    @field:NotBlank
    val externalId: String,
    
    @field:NotNull
    val managerId: UUID,
    
    val displayName: String? = null,
    val metadata: String? = null
)

data class UpdateChannelRequest(
    val displayName: String? = null,
    val managerId: UUID? = null,
    val status: ChannelStatus? = null,
    val metadata: String? = null
)

// === THREAD DTOs ===

data class ThreadDto(
    val id: UUID,
    val tenantId: UUID,
    val channelId: UUID,
    val contactId: UUID,
    val status: ThreadStatus,
    val assignedTo: UUID?,
    val priority: ThreadPriority,
    val subject: String?,
    val messageCount: Int,
    val unreadCount: Int,
    val lastMessageAt: LocalDateTime?,
    val lastCustomerMessageAt: LocalDateTime?,
    val lastAgentMessageAt: LocalDateTime?,
    val firstResponseAt: LocalDateTime?,
    val resolvedAt: LocalDateTime?,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime,
    
    // Related data
    val channel: ChannelDto?,
    val contact: ContactSummaryDto?,
    val lastMessage: MessageSummaryDto?
)

data class ThreadSummaryDto(
    val id: UUID,
    val status: ThreadStatus,
    val priority: ThreadPriority,
    val subject: String?,
    val unreadCount: Int,
    val lastMessageAt: LocalDateTime?,
    val contact: ContactSummaryDto?,
    val channel: ChannelSummaryDto?
)

data class ContactSummaryDto(
    val id: UUID,
    val firstName: String,
    val lastName: String,
    val email: String?,
    val phone: String?,
    val fullName: String,
    val username: String? = null
)

data class ChannelSummaryDto(
    val id: UUID,
    val type: ChannelType,
    val displayName: String?,
    val status: ChannelStatus
)

data class UpdateThreadRequest(
    val status: ThreadStatus? = null,
    val assignedTo: UUID? = null,
    val priority: ThreadPriority? = null,
    val subject: String? = null
)

// === MESSAGE DTOs ===

data class MessageDto(
    val id: UUID,
    val tenantId: UUID,
    val threadId: UUID,
    val direction: MessageDirection,
    val externalId: String,
    val messageType: MessageType,
    val content: String?,
    val contentHtml: String?,
    val attachments: List<AttachmentDto>?,
    val status: MessageStatus,
    val senderId: UUID?,
    val senderName: String?,
    val senderExternalId: String?,
    val replyToMessageId: UUID?,
    val sentAt: LocalDateTime,
    val deliveredAt: LocalDateTime?,
    val readAt: LocalDateTime?,
    val failedAt: LocalDateTime?,
    val errorMessage: String?,
    val sentimentScore: Double?,
    val sentimentLabel: SentimentLabel?,
    val isSpam: Boolean,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime,
    
    // Computed fields
    val isInbound: Boolean,
    val isOutbound: Boolean,
    val isDelivered: Boolean,
    val isRead: Boolean,
    val isFailed: Boolean,
    val hasAttachments: Boolean
)

data class MessageSummaryDto(
    val id: UUID,
    val direction: MessageDirection,
    val messageType: MessageType,
    val content: String?,
    val senderName: String?,
    val sentAt: LocalDateTime,
    val status: MessageStatus
)

data class AttachmentDto(
    val id: String,
    val name: String,
    val type: String,
    val size: Long?,
    val url: String?,
    val thumbnailUrl: String?
)

data class InboundMessageRequest(
    @field:NotNull
    val channelId: UUID,
    
    @field:NotBlank
    val externalId: String,
    
    @field:NotBlank
    val content: String,
    
    @field:NotBlank
    val senderExternalId: String,
    
    val senderName: String? = null,
    val messageType: MessageType = MessageType.TEXT,
    val sentAt: LocalDateTime? = null,
    val attachments: String? = null,
    val metadata: String? = null
)

data class OutboundMessageRequest(
    @field:NotNull
    val threadId: UUID,
    
    @field:NotBlank
    val content: String,
    
    @field:NotNull
    val senderId: UUID,
    
    @field:NotBlank
    val senderName: String,
    
    val messageType: MessageType = MessageType.TEXT,
    val attachments: String? = null,
    val replyToMessageId: UUID? = null,
    val metadata: String? = null
)

data class UpdateMessageStatusRequest(
    @field:NotNull
    val status: MessageStatus,
    
    val errorMessage: String? = null
)

data class UpdateSentimentRequest(
    val sentimentScore: Double?,
    val sentimentLabel: SentimentLabel?,
    val isSpam: Boolean = false,
    val confidenceScore: Double? = null
)

// === SEARCH AND FILTER DTOs ===

data class ThreadSearchRequest(
    val query: String? = null,
    val status: ThreadStatus? = null,
    val assignedTo: UUID? = null,
    val channelId: UUID? = null,
    val priority: ThreadPriority? = null,
    val dateFrom: LocalDateTime? = null,
    val dateTo: LocalDateTime? = null
)

data class MessageSearchRequest(
    val query: String? = null,
    val threadId: UUID? = null,
    val direction: MessageDirection? = null,
    val messageType: MessageType? = null,
    val sentimentLabel: SentimentLabel? = null,
    val hasAttachments: Boolean? = null,
    val dateFrom: LocalDateTime? = null,
    val dateTo: LocalDateTime? = null
)

// === STATISTICS DTOs ===

data class MessagingStatsDto(
    val threadStats: ThreadStatsDto,
    val messageStats: MessageStatsDto,
    val channelStats: ChannelStatsDto,
    val unreadCounts: UnreadCountsDto
)

data class ThreadStatsDto(
    val total: Long,
    val byStatus: Map<String, Long>,
    val unreadThreads: Long,
    val averageResponseTimeMinutes: Double?
)

data class MessageStatsDto(
    val total: Long,
    val byDirection: Map<String, Long>,
    val outboundByStatus: Map<String, Long>,
    val todayCount: Long,
    val weekCount: Long
)

data class ChannelStatsDto(
    val total: Int,
    val byType: Map<String, Long>,
    val byStatus: Map<String, Long>,
    val needingAttention: Int
)

data class UnreadCountsDto(
    val total: Long,
    val manager: Long
)

// === RESPONSE DTOs ===

data class MessagingResponse<T>(
    val success: Boolean,
    val data: T? = null,
    val error: String? = null,
    val timestamp: LocalDateTime = LocalDateTime.now()
)

data class PagedResponse<T>(
    val content: List<T>,
    val totalElements: Long,
    val totalPages: Int,
    val number: Int,
    val size: Int,
    val hasNext: Boolean,
    val hasPrevious: Boolean
)