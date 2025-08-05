package com.backend.core.user

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.util.*

@Service
@Transactional
class UserService(
    private val userRepository: UserRepository
) {

    fun findByEmail(email: String): UserEntity? =
        userRepository.findByEmail(email)

    fun findById(id: UUID): UserEntity? =
        userRepository.findById(id).orElse(null)

    fun existsByEmail(email: String): Boolean =
        userRepository.existsByEmail(email)

    fun save(user: UserEntity): UserEntity =
        userRepository.save(user)

    fun findActiveByEmail(email: String): UserEntity? =
        userRepository.findActiveByEmail(email)

    fun updateProfile(userId: UUID, updates: UserProfileUpdateRequest): UserEntity? {
        val existing = userRepository.findById(userId).orElse(null) ?: return null

        val updated = existing.copy(
            firstName = updates.firstName ?: existing.firstName,
            lastName = updates.lastName ?: existing.lastName,
            displayName = updates.displayName ?: existing.displayName,
            phone = updates.phone ?: existing.phone,
            title = updates.title ?: existing.title,
            department = updates.department ?: existing.department,
            bio = updates.bio ?: existing.bio,
            timezone = updates.timezone ?: existing.timezone,
            locale = updates.locale ?: existing.locale,
            theme = updates.theme ?: existing.theme,
            updatedAt = LocalDateTime.now()
        )

        return userRepository.save(updated)
    }

    fun updateSettings(userId: UUID, settings: UserSettingsUpdateRequest): UserEntity? {
        val existing = userRepository.findById(userId).orElse(null) ?: return null

        val updated = existing.copy(
            timezone = settings.timezone ?: existing.timezone,
            locale = settings.locale ?: existing.locale,
            theme = settings.theme ?: existing.theme,
            emailNotifications = settings.emailNotifications ?: existing.emailNotifications,
            smsNotifications = settings.smsNotifications ?: existing.smsNotifications,
            pushNotifications = settings.pushNotifications ?: existing.pushNotifications,
            marketingNotifications = settings.marketingNotifications ?: existing.marketingNotifications,
            updatedAt = LocalDateTime.now()
        )

        return userRepository.save(updated)
    }

    fun deactivateUser(userId: UUID): UserEntity? {
        val user = userRepository.findById(userId).orElse(null) ?: return null

        val updatedUser = user.copy(
            isActive = false,
            email = "deleted_${UUID.randomUUID()}_${user.email}",
            updatedAt = LocalDateTime.now()
        )

        return userRepository.save(updatedUser)
    }

    fun updateAvatar(userId: UUID, avatarUrl: String): UserEntity? {
        val user = userRepository.findById(userId).orElse(null) ?: return null

        val updatedUser = user.copy(
            avatarUrl = avatarUrl,
            updatedAt = LocalDateTime.now()
        )

        return userRepository.save(updatedUser)
    }

    fun removeAvatar(userId: UUID): UserEntity? {
        val user = userRepository.findById(userId).orElse(null) ?: return null

        val updatedUser = user.copy(
            avatarUrl = null,
            updatedAt = LocalDateTime.now()
        )

        return userRepository.save(updatedUser)
    }

    fun createUserProfile(userProfileRequest: CreateUserProfileRequest): UserEntity {
        val user = UserEntity(
            email = userProfileRequest.email,
            displayName = userProfileRequest.displayName,
            firstName = userProfileRequest.firstName,
            lastName = userProfileRequest.lastName,
            phone = userProfileRequest.phone,
            title = userProfileRequest.title,
            department = userProfileRequest.department,
            bio = userProfileRequest.bio,
            timezone = userProfileRequest.timezone ?: "UTC",
            locale = userProfileRequest.locale ?: "en",
            theme = userProfileRequest.theme ?: "light",
            role = userProfileRequest.role ?: UserRole.MANAGER
        )

        return userRepository.save(user)
    }
}