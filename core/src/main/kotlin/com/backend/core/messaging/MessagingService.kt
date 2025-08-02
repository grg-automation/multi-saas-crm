package com.backend.core.messaging

import com.backend.core.contact.ContactRepository
import com.backend.core.contact.ContactEntity
import com.backend.core.contact.ContactType
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.util.*

@Service
@Transactional
class MessagingService(
    private val threadRepository: ThreadRepository,
    private val messageRepository: MessageRepository,
    private val channelService: ChannelService,
    private val contactRepository: ContactRepository
) {

    // === THREAD OPERATIONS ===

    fun getInboxThreads(
        tenantId: UUID,
        managerId: UUID? = null,
        channelId: UUID? = null,
        pageable: Pageable
    ): Page<ThreadEntity> {
        return threadRepository.findInboxThreads(tenantId, managerId, channelId, pageable)
    }

    fun getInboxThreadsForManager(
        tenantId: UUID,
        assignedThreadIds: List<String>,
        channelId: UUID? = null,
        pageable: Pageable
    ): Page<ThreadEntity> {
        return threadRepository.findInboxThreadsForManager(tenantId, assignedThreadIds, channelId, pageable)
    }

    fun searchThreads(tenantId: UUID, query: String, pageable: Pageable): Page<ThreadEntity> {
        return threadRepository.searchThreads(tenantId, query, pageable)
    }

    fun getThreadById(threadId: UUID): ThreadEntity? {
        return threadRepository.findById(threadId).orElse(null)
    }

    fun getThreadMessages(threadId: UUID, pageable: Pageable): Page<MessageEntity> {
        return messageRepository.findByThreadIdOrderByCreatedAtAsc(threadId, pageable)
    }

    fun assignThread(threadId: UUID, managerId: UUID): ThreadEntity {
        threadRepository.assignToManager(threadId, managerId)
        return getThreadById(threadId)
            ?: throw IllegalArgumentException("Thread not found: $threadId")
    }

    fun updateThreadStatus(threadId: UUID, status: ThreadStatus): ThreadEntity {
        val thread = getThreadById(threadId)
            ?: throw IllegalArgumentException("Thread not found: $threadId")

        val updatedThread = thread.copy(
            status = status,
            resolvedAt = if (status == ThreadStatus.RESOLVED) LocalDateTime.now() else thread.resolvedAt,
            updatedAt = LocalDateTime.now()
        )

        return threadRepository.save(updatedThread)
    }

    fun markThreadAsRead(threadId: UUID): ThreadEntity {
        val readTime = LocalDateTime.now()
        messageRepository.markThreadMessagesAsRead(threadId, readTime)
        
        val thread = getThreadById(threadId)
            ?: throw IllegalArgumentException("Thread not found: $threadId")

        val updatedThread = thread.copy(
            unreadCount = 0,
            updatedAt = readTime
        )

        return threadRepository.save(updatedThread)
    }

    // === MESSAGE OPERATIONS ===

    fun createInboundMessage(
        tenantId: UUID,
        channelId: UUID,
        externalId: String,
        content: String,
        senderExternalId: String,
        senderName: String? = null,
        messageType: MessageType = MessageType.TEXT,
        sentAt: LocalDateTime = LocalDateTime.now(),
        attachments: String? = null,
        metadata: String? = null
    ): MessageEntity {
        
        // Check for duplicate message
        if (messageRepository.existsByTenantIdAndExternalId(tenantId, externalId)) {
            throw IllegalArgumentException("Message with external ID already exists: $externalId")
        }

        // Validate channel access
        val channel = channelService.validateChannelAccess(channelId, tenantId)

        // Find or create contact
        val contact = findOrCreateContactFromMessage(
            tenantId = tenantId,
            senderExternalId = senderExternalId,
            senderName = senderName,
            channelType = channel.type
        )

        // Find or create thread
        val thread = findOrCreateThread(
            tenantId = tenantId,
            channelId = channelId,
            contactId = contact.id
        )

        // Create message
        val message = MessageEntity(
            tenantId = tenantId,
            threadId = thread.id,
            direction = MessageDirection.INBOUND,
            externalId = externalId,
            messageType = messageType,
            content = content,
            attachments = attachments,
            senderExternalId = senderExternalId,
            senderName = senderName,
            sentAt = sentAt,
            metadata = metadata,
            status = MessageStatus.DELIVERED // Inbound messages are already delivered
        )

        val savedMessage = messageRepository.save(message)

        // Update thread counters
        threadRepository.incrementUnreadCount(thread.id, sentAt)
        
        // Update channel activity
        channelService.updateLastActivity(channelId, sentAt)

        return savedMessage
    }

    fun createOutboundMessage(
        tenantId: UUID,
        threadId: UUID,
        content: String,
        senderId: UUID,
        senderName: String,
        messageType: MessageType = MessageType.TEXT,
        attachments: String? = null,
        replyToMessageId: UUID? = null,
        metadata: String? = null
    ): MessageEntity {
        
        val thread = getThreadById(threadId)
            ?: throw IllegalArgumentException("Thread not found: $threadId")

        if (thread.tenantId != tenantId) {
            throw SecurityException("Access denied to thread: $threadId")
        }

        // Generate external ID for tracking
        val externalId = "out_${UUID.randomUUID()}"

        val message = MessageEntity(
            tenantId = tenantId,
            threadId = threadId,
            direction = MessageDirection.OUTBOUND,
            externalId = externalId,
            messageType = messageType,
            content = content,
            attachments = attachments,
            senderId = senderId,
            senderName = senderName,
            replyToMessageId = replyToMessageId,
            sentAt = LocalDateTime.now(),
            metadata = metadata,
            status = MessageStatus.QUEUED // Will be updated when actually sent
        )

        val savedMessage = messageRepository.save(message)

        // Update thread - mark as read and update agent message time
        val messageTime = LocalDateTime.now()
        threadRepository.markAsReadAndUpdateAgentMessage(threadId, messageTime)

        return savedMessage
    }

    fun updateMessageStatus(
        messageId: UUID,
        status: MessageStatus,
        errorMessage: String? = null
    ): MessageEntity {
        val timestamp = LocalDateTime.now()
        messageRepository.updateMessageStatus(messageId, status, timestamp, errorMessage)
        
        return messageRepository.findById(messageId).orElse(null)
            ?: throw IllegalArgumentException("Message not found: $messageId")
    }

    fun updateMessageSentiment(
        messageId: UUID,
        sentimentScore: Double?,
        sentimentLabel: SentimentLabel?,
        isSpam: Boolean = false,
        confidenceScore: Double? = null
    ) {
        messageRepository.updateSentimentAnalysis(
            messageId, sentimentScore, sentimentLabel, isSpam, confidenceScore
        )
    }

    // === HELPER METHODS ===

    private fun findOrCreateContactFromMessage(
        tenantId: UUID,
        senderExternalId: String,
        senderName: String?,
        channelType: ChannelType
    ): ContactEntity {
        // Try to find existing contact by external ID or other identifiers
        // This is a simplified implementation - in real scenario you'd have more sophisticated matching
        
        val names = senderName?.split(" ") ?: listOf("Unknown")
        val firstName = names.firstOrNull() ?: "Unknown"
        val lastName = names.drop(1).joinToString(" ").takeIf { it.isNotBlank() } ?: ""

        // For now, create a new contact - you might want to implement better matching logic
        val contact = ContactEntity(
            tenantId = tenantId,
            ownerId = UUID.randomUUID(), // This should be set to a default manager or system user
            firstName = firstName,
            lastName = lastName,
            contactType = ContactType.LEAD,
            source = "messaging_${channelType.name.lowercase()}",
            phone = if (channelType == ChannelType.WHATSAPP || channelType == ChannelType.SMS) senderExternalId else null,
            email = if (channelType == ChannelType.EMAIL) senderExternalId else null
        )

        return contactRepository.save(contact)
    }

    private fun findOrCreateThread(
        tenantId: UUID,
        channelId: UUID,
        contactId: UUID
    ): ThreadEntity {
        // Look for existing active thread
        val existingThread = threadRepository.findByChannelIdAndContactIdAndStatusNot(
            channelId, contactId, ThreadStatus.CLOSED
        )

        if (existingThread != null) {
            return existingThread
        }

        // Create new thread
        val thread = ThreadEntity(
            tenantId = tenantId,
            channelId = channelId,
            contactId = contactId,
            status = ThreadStatus.OPEN,
            lastMessageAt = LocalDateTime.now()
        )

        return threadRepository.save(thread)
    }

    // === STATISTICS ===

    fun getThreadStatistics(tenantId: UUID): Map<String, Any> {
        val statusStats = threadRepository.countByStatusAndTenant(tenantId)
            .associate { it[0].toString() to it[1] as Long }

        val unreadCount = threadRepository.countUnreadThreads(tenantId)

        return mapOf(
            "byStatus" to statusStats,
            "unreadThreads" to unreadCount
        )
    }

    fun getMessageStatistics(tenantId: UUID, fromDate: LocalDateTime): Map<String, Any> {
        val directionStats = messageRepository.countByDirectionAndDateRange(tenantId, fromDate)
            .associate { it[0].toString() to it[1] as Long }

        val outboundStatusStats = messageRepository.countOutboundMessagesByStatus(tenantId, fromDate)
            .associate { it[0].toString() to it[1] as Long }

        val totalMessages = messageRepository.countMessagesFromDate(tenantId, fromDate)
        val averageResponseTime = messageRepository.getAverageResponseTimeMinutes(tenantId, fromDate)

        return mapOf(
            "total" to totalMessages,
            "byDirection" to directionStats,
            "outboundByStatus" to outboundStatusStats,
            "averageResponseTimeMinutes" to (averageResponseTime ?: 0.0)
        )
    }

    fun getUnreadCounts(tenantId: UUID, managerId: UUID? = null): Map<String, Long> {
        val totalUnread = threadRepository.countUnreadThreads(tenantId)
        val managerUnread = if (managerId != null) {
            threadRepository.countUnreadThreadsByManager(tenantId, managerId)
        } else 0L

        return mapOf(
            "total" to totalUnread,
            "manager" to managerUnread
        )
    }
}