package com.backend.core.user

import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.*

@RestController
@RequestMapping("/users")
class UserController(
    private val userService: UserService
) {
    @GetMapping("/{userId}")
    fun getUserProfile(
        @PathVariable userId: UUID,
        @RequestHeader("X-Tenant-ID") tenantId: UUID
    ): ResponseEntity<UserEntity> {
        return userService.findById(userId)?.let { ResponseEntity.ok(it) }
            ?: ResponseEntity.notFound().build()
    }

    @PutMapping("/{userId}")
    fun updateUserProfile(
        @PathVariable userId: UUID,
        @Valid @RequestBody updates: UserProfileUpdateRequest,
        @RequestHeader("X-Tenant-ID") tenantId: UUID
    ): ResponseEntity<UserEntity> {
        return userService.updateProfile(userId, updates)?.let { ResponseEntity.ok(it) }
            ?: ResponseEntity.notFound().build()
    }

    @PutMapping("/{userId}/avatar")
    fun updateAvatar(
        @PathVariable userId: UUID,
        @RequestParam avatarUrl: String,
        @RequestHeader("X-Tenant-ID") tenantId: UUID
    ): ResponseEntity<Map<String, String>> {
        return userService.updateAvatar(userId, avatarUrl)?.let {
            ResponseEntity.ok(mapOf("message" to "Avatar updated", "avatarUrl" to avatarUrl))
        } ?: ResponseEntity.badRequest().body(mapOf("error" to "User not found"))
    }

    @DeleteMapping("/{userId}/avatar")
    fun deleteAvatar(
        @PathVariable userId: UUID,
        @RequestHeader("X-Tenant-ID") tenantId: UUID
    ): ResponseEntity<Map<String, String>> {
        return userService.removeAvatar(userId)?.let {
            ResponseEntity.ok(mapOf("message" to "Avatar deleted"))
        } ?: ResponseEntity.badRequest().body(mapOf("error" to "User not found"))
    }

    @DeleteMapping("/{userId}")
    fun deactivateUser(
        @PathVariable userId: UUID,
        @RequestHeader("X-Tenant-ID") tenantId: UUID
    ): ResponseEntity<Map<String, String>> {
        return userService.deactivateUser(userId)?.let {
            ResponseEntity.ok(mapOf("message" to "User deactivated"))
        } ?: ResponseEntity.badRequest().body(mapOf("error" to "User not found"))
    }
}