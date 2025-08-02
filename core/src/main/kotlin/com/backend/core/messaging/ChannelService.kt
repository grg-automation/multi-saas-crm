package com.backend.core.messaging

import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.util.*

@Service
@Transactional
class ChannelService(
    private val channelRepository: ChannelRepository
) {

    fun findAll(tenantId: UUID, pageable: Pageable): Page<ChannelEntity> {
        return channelRepository.findByTenantIdAndIsActiveTrueOrderByCreatedAtDesc(tenantId, pageable)
    }

    fun findById(channelId: UUID): ChannelEntity? {
        return channelRepository.findById(channelId).orElse(null)
    }

    fun findByTenant(tenantId: UUID): List<ChannelEntity> {
        return channelRepository.findByTenantIdAndIsActiveTrue(tenantId)
    }

    fun findByManager(tenantId: UUID, managerId: UUID): List<ChannelEntity> {
        return channelRepository.findByTenantIdAndManagerIdAndIsActiveTrue(tenantId, managerId)
    }

    fun findByType(tenantId: UUID, type: ChannelType): List<ChannelEntity> {
        return channelRepository.findByTenantIdAndTypeAndIsActiveTrue(tenantId, type)
    }

    fun findByExternalId(tenantId: UUID, type: ChannelType, externalId: String): ChannelEntity? {
        return channelRepository.findByTenantIdAndTypeAndExternalId(tenantId, type, externalId)
    }

    fun channelExists(tenantId: UUID, type: ChannelType, externalId: String): Boolean {
        return channelRepository.existsByTenantIdAndTypeAndExternalId(tenantId, type, externalId)
    }

    fun createChannel(
        tenantId: UUID,
        type: ChannelType,
        externalId: String,
        managerId: UUID,
        displayName: String? = null,
        metadata: String? = null
    ): ChannelEntity {
        // Check if channel already exists
        if (channelExists(tenantId, type, externalId)) {
            throw IllegalArgumentException("Channel already exists for ${type.name} with external ID: $externalId")
        }

        val channel = ChannelEntity(
            tenantId = tenantId,
            type = type,
            externalId = externalId,
            managerId = managerId,
            displayName = displayName ?: generateDisplayName(type, externalId),
            metadata = metadata,
            status = ChannelStatus.ACTIVE,
            lastActivityAt = LocalDateTime.now()
        )

        return channelRepository.save(channel)
    }

    fun updateChannel(
        channelId: UUID,
        displayName: String? = null,
        managerId: UUID? = null,
        status: ChannelStatus? = null,
        metadata: String? = null
    ): ChannelEntity {
        val channel = findById(channelId)
            ?: throw IllegalArgumentException("Channel not found: $channelId")

        val updatedChannel = channel.copy(
            displayName = displayName ?: channel.displayName,
            managerId = managerId ?: channel.managerId,
            status = status ?: channel.status,
            metadata = metadata ?: channel.metadata,
            updatedAt = LocalDateTime.now()
        )

        return channelRepository.save(updatedChannel)
    }

    fun deactivateChannel(channelId: UUID): ChannelEntity {
        val channel = findById(channelId)
            ?: throw IllegalArgumentException("Channel not found: $channelId")

        val deactivatedChannel = channel.copy(
            isActive = false,
            status = ChannelStatus.INACTIVE,
            updatedAt = LocalDateTime.now()
        )

        return channelRepository.save(deactivatedChannel)
    }

    fun updateChannelStatus(channelId: UUID, status: ChannelStatus): ChannelEntity {
        return updateChannel(channelId, status = status)
    }

    fun updateLastActivity(channelId: UUID, activityTime: LocalDateTime = LocalDateTime.now()) {
        channelRepository.updateLastActivity(channelId, activityTime)
    }

    // Channel statistics
    fun getChannelStatsByTenant(tenantId: UUID): Map<String, Any> {
        val typeStats = channelRepository.countByTypeAndTenant(tenantId)
            .associate { it[0].toString() to it[1] as Long }

        val statusStats = channelRepository.countByStatusAndTenant(tenantId)
            .associate { it[0].toString() to it[1] as Long }

        val totalChannels = channelRepository.findByTenantIdAndIsActiveTrue(tenantId).size

        return mapOf(
            "total" to totalChannels,
            "byType" to typeStats,
            "byStatus" to statusStats
        )
    }

    fun getChannelsNeedingAttention(tenantId: UUID): List<ChannelEntity> {
        return channelRepository.findChannelsNeedingAttention(tenantId)
    }

    fun getInactiveChannels(tenantId: UUID, daysThreshold: Int = 7): List<ChannelEntity> {
        val cutoffDate = LocalDateTime.now().minusDays(daysThreshold.toLong())
        return channelRepository.findInactiveChannels(tenantId, cutoffDate)
    }

    // Helper methods
    private fun generateDisplayName(type: ChannelType, externalId: String): String {
        return when (type) {
            ChannelType.TELEGRAM -> "Telegram: $externalId"
            ChannelType.WHATSAPP -> "WhatsApp: $externalId"
            ChannelType.EMAIL -> "Email: $externalId"
            ChannelType.SMS -> "SMS: $externalId"
        }
    }

    fun validateChannelAccess(channelId: UUID, tenantId: UUID, managerId: UUID? = null): ChannelEntity {
        val channel = findById(channelId)
            ?: throw IllegalArgumentException("Channel not found: $channelId")

        if (channel.tenantId != tenantId) {
            throw SecurityException("Access denied to channel: $channelId")
        }

        if (managerId != null && channel.managerId != managerId) {
            throw SecurityException("Manager $managerId does not have access to channel: $channelId")
        }

        if (!channel.isActive) {
            throw IllegalStateException("Channel is not active: $channelId")
        }

        return channel
    }

    // Bulk operations
    fun reassignChannels(fromManagerId: UUID, toManagerId: UUID, tenantId: UUID): Int {
        val channels = channelRepository.findByTenantIdAndManagerIdAndIsActiveTrue(tenantId, fromManagerId)
        
        channels.forEach { channel ->
            val updatedChannel = channel.copy(
                managerId = toManagerId,
                updatedAt = LocalDateTime.now()
            )
            channelRepository.save(updatedChannel)
        }

        return channels.size
    }

    fun getChannelsByStatus(tenantId: UUID, status: ChannelStatus): List<ChannelEntity> {
        return channelRepository.findByTenantIdAndStatusAndIsActiveTrue(tenantId, status)
    }
}