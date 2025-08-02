package com.backend.core.messaging

import jakarta.persistence.*
import jakarta.validation.constraints.NotBlank
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "messages")
data class MessageEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(name = "tenant_id", nullable = false, columnDefinition = "UUID")
    val tenantId: UUID,

    @Column(name = "thread_id", nullable = false, columnDefinition = "UUID")
    val threadId: UUID,

    @Enumerated(EnumType.STRING)
    @Column(name = "direction", nullable = false, length = 20)
    val direction: MessageDirection,

    @NotBlank
    @Column(name = "external_id", nullable = false, length = 255)
    val externalId: String, // ID from external system (telegram, whatsapp)

    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", nullable = false, length = 20)
    val messageType: MessageType = MessageType.TEXT,

    @Column(name = "content", columnDefinition = "TEXT")
    val content: String? = null, // Message text content

    @Column(name = "content_html", columnDefinition = "TEXT")
    val contentHtml: String? = null, // HTML formatted content

    @Column(name = "attachments", columnDefinition = "TEXT")
    val attachments: String? = null, // JSON array of attachments

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    val status: MessageStatus = MessageStatus.SENT,

    // Sender information
    @Column(name = "sender_id", columnDefinition = "UUID")
    val senderId: UUID? = null, // User ID if sent by agent

    @Column(name = "sender_name", length = 255)
    val senderName: String? = null, // Display name of sender

    @Column(name = "sender_external_id", length = 255)
    val senderExternalId: String? = null, // External sender ID

    // Message metadata
    @Column(name = "reply_to_message_id", columnDefinition = "UUID")
    val replyToMessageId: UUID? = null, // If this is a reply

    @Column(name = "forward_from", length = 500)
    val forwardFrom: String? = null, // If message was forwarded

    @Column(name = "edited_at")
    val editedAt: LocalDateTime? = null,

    // Delivery tracking
    @Column(name = "sent_at", nullable = false)
    val sentAt: LocalDateTime,

    @Column(name = "delivered_at")
    val deliveredAt: LocalDateTime? = null,

    @Column(name = "read_at")
    val readAt: LocalDateTime? = null,

    @Column(name = "failed_at")
    val failedAt: LocalDateTime? = null,

    @Column(name = "error_message", columnDefinition = "TEXT")
    val errorMessage: String? = null,

    // Content analysis (from AI service)
    @Column(name = "sentiment_score")
    val sentimentScore: Double? = null, // -1.0 to 1.0

    @Enumerated(EnumType.STRING)
    @Column(name = "sentiment_label", length = 20)
    val sentimentLabel: SentimentLabel? = null,

    @Column(name = "language_code", length = 10)
    val languageCode: String? = null,

    @Column(name = "is_spam")
    val isSpam: Boolean = false,

    @Column(name = "confidence_score")
    val confidenceScore: Double? = null,

    // Metadata
    @Column(name = "metadata", columnDefinition = "TEXT")
    val metadata: String? = null, // Additional JSON metadata

    // Audit fields
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @UpdateTimestamp
    @Column(name = "updated_at")
    val updatedAt: LocalDateTime = LocalDateTime.now(),

    // Relations
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "thread_id", insertable = false, updatable = false)
    val thread: ThreadEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_to_message_id", insertable = false, updatable = false)
    val replyToMessage: MessageEntity? = null
) {
    // Computed properties
    val isInbound: Boolean
        get() = direction == MessageDirection.INBOUND

    val isOutbound: Boolean
        get() = direction == MessageDirection.OUTBOUND

    val isDelivered: Boolean
        get() = deliveredAt != null

    val isRead: Boolean
        get() = readAt != null

    val isFailed: Boolean
        get() = status == MessageStatus.FAILED

    val hasAttachments: Boolean
        get() = !attachments.isNullOrBlank()

    val deliveryDuration: Long?
        get() = if (deliveredAt != null) {
            java.time.Duration.between(sentAt, deliveredAt).toMillis()
        } else null
}

enum class MessageDirection {
    INBOUND,    // From customer to agent
    OUTBOUND    // From agent to customer
}

enum class MessageType {
    TEXT,           // Plain text message
    IMAGE,          // Image attachment
    VIDEO,          // Video attachment
    AUDIO,          // Audio/voice message
    DOCUMENT,       // Document/file
    LOCATION,       // Location sharing
    CONTACT,        // Contact card
    STICKER,        // Sticker/emoji
    SYSTEM          // System notification
}

enum class MessageStatus {
    QUEUED,         // Message queued for sending
    SENT,           // Message sent successfully
    DELIVERED,      // Message delivered to recipient
    READ,           // Message read by recipient
    FAILED,         // Message failed to send
    CANCELLED       // Message sending cancelled
}

enum class SentimentLabel {
    POSITIVE,
    NEGATIVE,
    NEUTRAL,
    MIXED
}