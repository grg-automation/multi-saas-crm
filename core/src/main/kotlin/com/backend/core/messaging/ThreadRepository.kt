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
interface ThreadRepository : JpaRepository<ThreadEntity, UUID> {

    // Find by tenant and status
    fun findByTenantIdAndStatusOrderByLastMessageAtDesc(
        tenantId: UUID, 
        status: ThreadStatus, 
        pageable: Pageable
    ): Page<ThreadEntity>

    // Find by assigned manager
    fun findByTenantIdAndAssignedToOrderByLastMessageAtDesc(
        tenantId: UUID, 
        assignedTo: UUID, 
        pageable: Pageable
    ): Page<ThreadEntity>

    // Find unassigned threads
    fun findByTenantIdAndAssignedToIsNullAndStatusInOrderByCreatedAtDesc(
        tenantId: UUID, 
        statuses: List<ThreadStatus>, 
        pageable: Pageable
    ): Page<ThreadEntity>

    // Find by channel
    fun findByChannelIdOrderByLastMessageAtDesc(channelId: UUID, pageable: Pageable): Page<ThreadEntity>

    // Find by contact
    fun findByContactIdOrderByLastMessageAtDesc(contactId: UUID, pageable: Pageable): Page<ThreadEntity>

    // Find existing thread for channel + contact
    fun findByChannelIdAndContactIdAndStatusNot(
        channelId: UUID, 
        contactId: UUID, 
        status: ThreadStatus
    ): ThreadEntity?

    // Search threads
    @Query("""
        SELECT t FROM ThreadEntity t 
        LEFT JOIN t.contact c 
        WHERE t.tenantId = :tenantId 
        AND (
            LOWER(t.subject) LIKE LOWER(CONCAT('%', :query, '%')) 
            OR LOWER(c.firstName) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(c.lastName) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(c.email) LIKE LOWER(CONCAT('%', :query, '%'))
        )
        ORDER BY t.lastMessageAt DESC
    """)
    fun searchThreads(
        @Param("tenantId") tenantId: UUID,
        @Param("query") query: String,
        pageable: Pageable
    ): Page<ThreadEntity>

    // Inbox view - active threads with recent activity
    @Query("""
        SELECT t FROM ThreadEntity t 
        WHERE t.tenantId = :tenantId 
        AND t.status IN ('OPEN', 'PENDING')
        AND (:managerId IS NULL OR t.assignedTo = :managerId)
        AND (:channelId IS NULL OR t.channelId = :channelId)
        ORDER BY 
            CASE WHEN t.unreadCount > 0 THEN 0 ELSE 1 END,
            t.priority DESC,
            t.lastMessageAt DESC
    """)
    fun findInboxThreads(
        @Param("tenantId") tenantId: UUID,
        @Param("managerId") managerId: UUID?,
        @Param("channelId") channelId: UUID?,
        pageable: Pageable
    ): Page<ThreadEntity>

    // Inbox view для менеджеров - только назначенные треды
    @Query("""
        SELECT t FROM ThreadEntity t 
        WHERE t.tenantId = :tenantId 
        AND t.status IN ('OPEN', 'PENDING')
        AND CAST(t.id AS string) IN :assignedThreadIds
        AND (:channelId IS NULL OR t.channelId = :channelId)
        ORDER BY 
            CASE WHEN t.unreadCount > 0 THEN 0 ELSE 1 END,
            t.priority DESC,
            t.lastMessageAt DESC
    """)
    fun findInboxThreadsForManager(
        @Param("tenantId") tenantId: UUID,
        @Param("assignedThreadIds") assignedThreadIds: List<String>,
        @Param("channelId") channelId: UUID?,
        pageable: Pageable
    ): Page<ThreadEntity>

    // Statistics
    @Query("""
        SELECT t.status, COUNT(t) 
        FROM ThreadEntity t 
        WHERE t.tenantId = :tenantId 
        GROUP BY t.status
    """)
    fun countByStatusAndTenant(@Param("tenantId") tenantId: UUID): List<Array<Any>>

    @Query("""
        SELECT COUNT(t) 
        FROM ThreadEntity t 
        WHERE t.tenantId = :tenantId 
        AND t.unreadCount > 0
    """)
    fun countUnreadThreads(@Param("tenantId") tenantId: UUID): Long

    @Query("""
        SELECT COUNT(t) 
        FROM ThreadEntity t 
        WHERE t.tenantId = :tenantId 
        AND t.assignedTo = :managerId 
        AND t.unreadCount > 0
    """)
    fun countUnreadThreadsByManager(@Param("tenantId") tenantId: UUID, @Param("managerId") managerId: UUID): Long

    // Performance analytics
    @Query("""
        SELECT t FROM ThreadEntity t 
        WHERE t.tenantId = :tenantId 
        AND t.firstResponseAt IS NULL 
        AND t.status = 'OPEN'
        AND t.createdAt < :cutoffTime
        ORDER BY t.createdAt ASC
    """)
    fun findThreadsWithoutResponse(
        @Param("tenantId") tenantId: UUID,
        @Param("cutoffTime") cutoffTime: LocalDateTime
    ): List<ThreadEntity>

    @Query("""
        SELECT AVG(
            EXTRACT(EPOCH FROM t.firstResponseAt) - EXTRACT(EPOCH FROM t.createdAt)
        ) / 60.0
        FROM ThreadEntity t 
        WHERE t.tenantId = :tenantId 
        AND t.firstResponseAt IS NOT NULL
        AND t.createdAt >= :fromDate
    """)
    fun getAverageResponseTimeMinutes(
        @Param("tenantId") tenantId: UUID,
        @Param("fromDate") fromDate: LocalDateTime
    ): Double?

    // Update operations
    @Query("""
        UPDATE ThreadEntity t 
        SET t.unreadCount = t.unreadCount + 1,
            t.lastMessageAt = :messageTime,
            t.lastCustomerMessageAt = :messageTime
        WHERE t.id = :threadId
    """)
    fun incrementUnreadCount(
        @Param("threadId") threadId: UUID,
        @Param("messageTime") messageTime: LocalDateTime
    )

    @Query("""
        UPDATE ThreadEntity t 
        SET t.unreadCount = 0,
            t.lastMessageAt = :messageTime,
            t.lastAgentMessageAt = :messageTime,
            t.firstResponseAt = CASE 
                WHEN t.firstResponseAt IS NULL THEN :messageTime 
                ELSE t.firstResponseAt 
            END
        WHERE t.id = :threadId
    """)
    fun markAsReadAndUpdateAgentMessage(
        @Param("threadId") threadId: UUID,
        @Param("messageTime") messageTime: LocalDateTime
    )

    @Query("""
        UPDATE ThreadEntity t 
        SET t.assignedTo = :managerId 
        WHERE t.id = :threadId
    """)
    fun assignToManager(@Param("threadId") threadId: UUID, @Param("managerId") managerId: UUID)
}