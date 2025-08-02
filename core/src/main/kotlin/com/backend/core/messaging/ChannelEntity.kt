package com.backend.core.messaging

import jakarta.persistence.*
import jakarta.validation.constraints.NotBlank
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "channels")
data class ChannelEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(name = "tenant_id", nullable = false, columnDefinition = "UUID")
    val tenantId: UUID,

    @Enumerated(EnumType.STRING)
    @Column(name = "channel_type", nullable = false, length = 20)
    val type: ChannelType,

    @NotBlank
    @Column(name = "external_id", nullable = false, length = 255)
    val externalId: String, // telegram user_id, whatsapp phone number

    @Column(name = "manager_id", nullable = false, columnDefinition = "UUID")
    val managerId: UUID, // owner manager

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    val status: ChannelStatus = ChannelStatus.ACTIVE,

    @Column(name = "display_name", length = 255)
    val displayName: String? = null, // Human readable name

    @Column(name = "metadata", columnDefinition = "TEXT")
    val metadata: String? = null, // JSON configuration

    @Column(name = "is_active")
    val isActive: Boolean = true,

    @Column(name = "last_activity_at")
    val lastActivityAt: LocalDateTime? = null,

    // Audit fields
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @UpdateTimestamp
    @Column(name = "updated_at")
    val updatedAt: LocalDateTime = LocalDateTime.now()
) {
    // Computed property for unique identifier
    val uniqueIdentifier: String
        get() = "${type.name.lowercase()}_${externalId}"
}

enum class ChannelType {
    TELEGRAM,
    WHATSAPP,
    EMAIL,
    SMS
}

enum class ChannelStatus {
    ACTIVE,           // Channel is working normally
    INACTIVE,         // Channel is disabled
    AUTHENTICATION_REQUIRED, // Need to re-authenticate
    ERROR,            // Channel has errors
    SUSPENDED         // Channel is temporarily suspended
}