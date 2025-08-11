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
    fun findByEmail(email: String): UserEntity? = userRepository.findByEmail(email)

    fun findById(id: UUID): UserEntity? = userRepository.findById(id).orElse(null)

    fun existsByEmail(email: String): Boolean = userRepository.existsByEmail(email)

    fun save(user: UserEntity): UserEntity = userRepository.save(user)

    fun updateProfile(userId: UUID, updates: UserProfileUpdateRequest): UserEntity? {
        val existing = userRepository.findById(userId).orElse(null) ?: return null
        val updated = existing.copy(
            firstName = updates.firstName ?: existing.firstName,
            lastName = updates.lastName ?: existing.lastName,
            displayName = updates.displayName ?: existing.displayName,
            updatedAt = LocalDateTime.now()
        )
        return userRepository.save(updated)
    }

    fun deactivateUser(userId: UUID): UserEntity? {
        val user = userRepository.findById(userId).orElse(null) ?: return null
        val updatedUser = user.copy(isActive = false, updatedAt = LocalDateTime.now())
        return userRepository.save(updatedUser)
    }

    fun updateAvatar(userId: UUID, avatarUrl: String): UserEntity? {
        val user = userRepository.findById(userId).orElse(null) ?: return null
        val updatedUser = user.copy(avatarUrl = avatarUrl, updatedAt = LocalDateTime.now())
        return userRepository.save(updatedUser)
    }

    fun removeAvatar(userId: UUID): UserEntity? {
        val user = userRepository.findById(userId).orElse(null) ?: return null
        val updatedUser = user.copy(avatarUrl = null, updatedAt = LocalDateTime.now())
        return userRepository.save(updatedUser)
    }

    fun createUserProfile(userProfileRequest: CreateUserProfileRequest, tenantId: UUID): UserEntity {
        if (userRepository.existsByEmail(userProfileRequest.email)) {
            throw IllegalArgumentException("Email already in use")
        }
        val user = UserEntity(
            email = userProfileRequest.email,
            displayName = userProfileRequest.displayName,
            firstName = userProfileRequest.firstName,
            lastName = userProfileRequest.lastName,
            tenantId = tenantId
        )
        return userRepository.save(user)
    }
}