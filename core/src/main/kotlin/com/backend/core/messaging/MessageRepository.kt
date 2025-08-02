package com.backend.core.messaging

import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.LocalDateTime
import java.util.*

@Repository
interface MessageRepository : JpaRepository<MessageEntity, UUID> {

    // Find messages by thread
    fun findByThreadIdOrderByCreatedAtAsc(threadId: UUID, pageable: Pageable): Page<MessageEntity>
    
    fun findByThreadIdOrderByCreatedAtDesc(threadId: UUID, pageable: Pageable): Page<MessageEntity>

    // Find by external ID (for deduplication)
    fun findByTenantIdAndExternalId(tenantId: UUID, externalId: String): MessageEntity?

    fun existsByTenantIdAndExternalId(tenantId: UUID, externalId: String): Boolean

    // Find recent messages for thread
    @Query("""
        SELECT m FROM MessageEntity m 
        WHERE m.threadId = :threadId 
        ORDER BY m.createdAt DESC
    """)
    fun findRecentMessagesByThread(@Param("threadId") threadId: UUID, pageable: Pageable): Page<MessageEntity>

    // Find unread messages
    @Query("""
        SELECT m FROM MessageEntity m 
        WHERE m.threadId = :threadId 
        AND m.direction = 'INBOUND'
        AND m.readAt IS NULL
        ORDER BY m.createdAt ASC
    """)
    fun findUnreadMessagesByThread(@Param("threadId") threadId: UUID): List<MessageEntity>

    // Find failed messages
    fun findByTenantIdAndStatusAndFailedAtIsNotNull(
        tenantId: UUID, 
        status: MessageStatus, 
        pageable: Pageable
    ): Page<MessageEntity>

    // Search messages by content
    @Query("""
        SELECT m FROM MessageEntity m 
        WHERE m.tenantId = :tenantId 
        AND LOWER(m.content) LIKE LOWER(CONCAT('%', :query, '%'))
        ORDER BY m.createdAt DESC
    """)
    fun searchMessagesByContent(
        @Param("tenantId") tenantId: UUID,
        @Param("query") query: String,
        pageable: Pageable
    ): Page<MessageEntity>

    // Find messages by date range
    @Query("""
        SELECT m FROM MessageEntity m 
        WHERE m.tenantId = :tenantId 
        AND m.createdAt BETWEEN :fromDate AND :toDate
        ORDER BY m.createdAt DESC
    """)
    fun findMessagesByDateRange(
        @Param("tenantId") tenantId: UUID,
        @Param("fromDate") fromDate: LocalDateTime,
        @Param("toDate") toDate: LocalDateTime,
        pageable: Pageable
    ): Page<MessageEntity>

    // Find last message in thread
    @Query("""
        SELECT m FROM MessageEntity m 
        WHERE m.threadId = :threadId 
        ORDER BY m.createdAt DESC
        LIMIT 1
    """)
    fun findLastMessageInThread(@Param("threadId") threadId: UUID): MessageEntity?

    // Find messages by sentiment
    fun findByTenantIdAndSentimentLabelOrderByCreatedAtDesc(
        tenantId: UUID, 
        sentimentLabel: SentimentLabel, 
        pageable: Pageable
    ): Page<MessageEntity>

    // Find messages with attachments
    @Query("""
        SELECT m FROM MessageEntity m 
        WHERE m.tenantId = :tenantId 
        AND m.attachments IS NOT NULL 
        AND m.attachments != ''
        ORDER BY m.createdAt DESC
    """)
    fun findMessagesWithAttachments(@Param("tenantId") tenantId: UUID, pageable: Pageable): Page<MessageEntity>

    // Statistics
    @Query("""
        SELECT m.direction, COUNT(m) 
        FROM MessageEntity m 
        WHERE m.tenantId = :tenantId 
        AND m.createdAt >= :fromDate
        GROUP BY m.direction
    """)
    fun countByDirectionAndDateRange(
        @Param("tenantId") tenantId: UUID,
        @Param("fromDate") fromDate: LocalDateTime
    ): List<Array<Any>>

    @Query("""
        SELECT m.status, COUNT(m) 
        FROM MessageEntity m 
        WHERE m.tenantId = :tenantId 
        AND m.direction = 'OUTBOUND'
        AND m.createdAt >= :fromDate
        GROUP BY m.status
    """)
    fun countOutboundMessagesByStatus(
        @Param("tenantId") tenantId: UUID,
        @Param("fromDate") fromDate: LocalDateTime
    ): List<Array<Any>>

    @Query("""
        SELECT COUNT(m) 
        FROM MessageEntity m 
        WHERE m.tenantId = :tenantId 
        AND m.createdAt >= :fromDate
    """)
    fun countMessagesFromDate(@Param("tenantId") tenantId: UUID, @Param("fromDate") fromDate: LocalDateTime): Long

    // Average response time
    @Query("""
        SELECT AVG(
            (EXTRACT(EPOCH FROM resp.createdAt) - EXTRACT(EPOCH FROM msg.createdAt)) / 60.0
        )
        FROM MessageEntity msg
        JOIN MessageEntity resp ON resp.threadId = msg.threadId
        WHERE msg.tenantId = :tenantId
        AND msg.direction = 'INBOUND'
        AND resp.direction = 'OUTBOUND'
        AND resp.createdAt > msg.createdAt
        AND resp.createdAt = (
            SELECT MIN(r2.createdAt)
            FROM MessageEntity r2
            WHERE r2.threadId = msg.threadId
            AND r2.direction = 'OUTBOUND'
            AND r2.createdAt > msg.createdAt
        )
        AND msg.createdAt >= :fromDate
    """)
    fun getAverageResponseTimeMinutes(
        @Param("tenantId") tenantId: UUID,
        @Param("fromDate") fromDate: LocalDateTime
    ): Double?

    // Mark messages as read
    @Query("""
        UPDATE MessageEntity m 
        SET m.readAt = :readTime 
        WHERE m.threadId = :threadId 
        AND m.direction = 'INBOUND'
        AND m.readAt IS NULL
    """)
    fun markThreadMessagesAsRead(@Param("threadId") threadId: UUID, @Param("readTime") readTime: LocalDateTime)

    // Update message status
    @Query("""
        UPDATE MessageEntity m 
        SET m.status = :status, 
            m.deliveredAt = CASE WHEN :status = 'DELIVERED' THEN :timestamp ELSE m.deliveredAt END,
            m.readAt = CASE WHEN :status = 'READ' THEN :timestamp ELSE m.readAt END,
            m.failedAt = CASE WHEN :status = 'FAILED' THEN :timestamp ELSE m.failedAt END,
            m.errorMessage = :errorMessage
        WHERE m.id = :messageId
    """)
    fun updateMessageStatus(
        @Param("messageId") messageId: UUID,
        @Param("status") status: MessageStatus,
        @Param("timestamp") timestamp: LocalDateTime,
        @Param("errorMessage") errorMessage: String?
    )

    // Update sentiment analysis
    @Query("""
        UPDATE MessageEntity m 
        SET m.sentimentScore = :score,
            m.sentimentLabel = :label,
            m.isSpam = :isSpam,
            m.confidenceScore = :confidence
        WHERE m.id = :messageId
    """)
    fun updateSentimentAnalysis(
        @Param("messageId") messageId: UUID,
        @Param("score") score: Double?,
        @Param("label") label: SentimentLabel?,
        @Param("isSpam") isSpam: Boolean,
        @Param("confidence") confidence: Double?
    )
}