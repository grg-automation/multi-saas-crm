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
interface ChannelRepository : JpaRepository<ChannelEntity, UUID> {

    // Find by tenant
    fun findByTenantIdAndIsActiveTrue(tenantId: UUID): List<ChannelEntity>
    
    fun findByTenantIdAndIsActiveTrueOrderByCreatedAtDesc(tenantId: UUID, pageable: Pageable): Page<ChannelEntity>

    // Find by manager
    fun findByTenantIdAndManagerIdAndIsActiveTrue(tenantId: UUID, managerId: UUID): List<ChannelEntity>

    // Find by type
    fun findByTenantIdAndTypeAndIsActiveTrue(tenantId: UUID, type: ChannelType): List<ChannelEntity>

    // Find by external ID (unique per tenant and type)
    fun findByTenantIdAndTypeAndExternalId(tenantId: UUID, type: ChannelType, externalId: String): ChannelEntity?

    // Find by status
    fun findByTenantIdAndStatusAndIsActiveTrue(tenantId: UUID, status: ChannelStatus): List<ChannelEntity>

    // Check if channel exists
    fun existsByTenantIdAndTypeAndExternalId(tenantId: UUID, type: ChannelType, externalId: String): Boolean

    // Statistics queries
    @Query("""
        SELECT c.type, COUNT(c) 
        FROM ChannelEntity c 
        WHERE c.tenantId = :tenantId AND c.isActive = true
        GROUP BY c.type
    """)
    fun countByTypeAndTenant(@Param("tenantId") tenantId: UUID): List<Array<Any>>

    @Query("""
        SELECT c.status, COUNT(c) 
        FROM ChannelEntity c 
        WHERE c.tenantId = :tenantId AND c.isActive = true
        GROUP BY c.status
    """)
    fun countByStatusAndTenant(@Param("tenantId") tenantId: UUID): List<Array<Any>>

    // Find channels that need attention (authentication required, errors)
    @Query("""
        SELECT c FROM ChannelEntity c 
        WHERE c.tenantId = :tenantId 
        AND c.isActive = true 
        AND c.status IN ('AUTHENTICATION_REQUIRED', 'ERROR')
        ORDER BY c.updatedAt DESC
    """)
    fun findChannelsNeedingAttention(@Param("tenantId") tenantId: UUID): List<ChannelEntity>

    // Find inactive channels (no activity for specified days)
    @Query("""
        SELECT c FROM ChannelEntity c 
        WHERE c.tenantId = :tenantId 
        AND c.isActive = true 
        AND (c.lastActivityAt IS NULL OR c.lastActivityAt < :cutoffDate)
        ORDER BY c.lastActivityAt ASC
    """)
    fun findInactiveChannels(
        @Param("tenantId") tenantId: UUID, 
        @Param("cutoffDate") cutoffDate: LocalDateTime
    ): List<ChannelEntity>

    // Update last activity
    @Query("""
        UPDATE ChannelEntity c 
        SET c.lastActivityAt = :activityTime 
        WHERE c.id = :channelId
    """)
    fun updateLastActivity(@Param("channelId") channelId: UUID, @Param("activityTime") activityTime: LocalDateTime)
}