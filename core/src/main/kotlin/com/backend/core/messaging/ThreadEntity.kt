package com.backend.core.messaging

import com.backend.core.contact.ContactEntity
import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "threads")
data class ThreadEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(name = "tenant_id", nullable = false, columnDefinition = "UUID")
    val tenantId: UUID,

    @Column(name = "channel_id", nullable = false, columnDefinition = "UUID")
    val channelId: UUID,

    @Column(name = "contact_id", nullable = false, columnDefinition = "UUID")
    val contactId: UUID,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    val status: ThreadStatus = ThreadStatus.OPEN,

    @Column(name = "assigned_to", columnDefinition = "UUID")
    val assignedTo: UUID? = null, // Which manager is handling this thread

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 20)
    val priority: ThreadPriority = ThreadPriority.NORMAL,

    @Column(name = "subject", length = 500)
    val subject: String? = null, // Thread subject/title

    @Column(name = "external_thread_id", length = 255)
    val externalThreadId: String? = null, // External system thread ID

    // Message counters
    @Column(name = "message_count")
    val messageCount: Int = 0,

    @Column(name = "unread_count")
    val unreadCount: Int = 0,

    // Important timestamps
    @Column(name = "last_message_at")
    val lastMessageAt: LocalDateTime? = null,

    @Column(name = "last_customer_message_at")
    val lastCustomerMessageAt: LocalDateTime? = null,

    @Column(name = "last_agent_message_at")
    val lastAgentMessageAt: LocalDateTime? = null,

    @Column(name = "first_response_at")
    val firstResponseAt: LocalDateTime? = null, // When agent first responded

    @Column(name = "resolved_at")
    val resolvedAt: LocalDateTime? = null,

    // Metadata
    @Column(name = "tags", columnDefinition = "TEXT")
    val tags: String? = null, // JSON array of tags

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
    @JoinColumn(name = "channel_id", insertable = false, updatable = false)
    val channel: ChannelEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contact_id", insertable = false, updatable = false)
    val contact: ContactEntity? = null
) {
    // Computed properties
    val isUnread: Boolean
        get() = unreadCount > 0

    val responseTime: Long?
        get() = if (firstResponseAt != null && createdAt != null) {
            java.time.Duration.between(createdAt, firstResponseAt).toMinutes()
        } else null
}

enum class ThreadStatus {
    OPEN,           // Active conversation
    PENDING,        // Waiting for customer response
    RESOLVED,       // Issue resolved/conversation ended
    CLOSED,         // Conversation closed
    ARCHIVED,       // Archived conversation
    SPAM            // Marked as spam
}

enum class ThreadPriority {
    LOW,
    NORMAL,
    HIGH,
    URGENT
}