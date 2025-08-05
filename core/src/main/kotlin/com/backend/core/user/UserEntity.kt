package com.backend.core.user

import com.fasterxml.jackson.annotation.JsonIgnore
import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "users")
data class UserEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(unique = true, nullable = false)
    val email: String,

    @Column(unique = true)
    val displayName: String? = null,

    // Remove hashedPassword - handled by identity service
    // @Column(name = "hashed_password", nullable = false)
    // val hashedPassword: String,

    @Column(name = "first_name")
    val firstName: String? = null,

    @Column(name = "last_name")
    val lastName: String? = null,

    // Profile fields
    @Column(name = "avatar_url")
    val avatarUrl: String? = null,

    val phone: String? = null,
    val title: String? = null,
    val department: String? = null,

    @Column(columnDefinition = "TEXT")
    val bio: String? = null,

    // Settings
    val timezone: String = "UTC",
    val locale: String = "en",
    val theme: String = "light",

    @Column(name = "email_notifications")
    val emailNotifications: Boolean = true,

    @Column(name = "sms_notifications")
    val smsNotifications: Boolean = false,

    @Column(name = "push_notifications")
    val pushNotifications: Boolean = true,

    @Column(name = "marketing_notifications")
    val marketingNotifications: Boolean = false,

    // Status fields
    @Column(name = "is_active")
    val isActive: Boolean = true,

    @Column(name = "is_verified")
    val isVerified: Boolean = false,

    @Column(name = "is_superuser")
    val isSuperuser: Boolean = false,

    @Enumerated(EnumType.STRING)
    @Column(name = "role")
    val role: UserRole = UserRole.MANAGER,

    // Keep basic timestamps
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @UpdateTimestamp
    @Column(name = "updated_at")
    val updatedAt: LocalDateTime = LocalDateTime.now()
) {
    val fullName: String
        get() = "${firstName ?: ""} ${lastName ?: ""}".trim()
}