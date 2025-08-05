package com.backend.core.user

import com.backend.core.base.BaseController
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.*

@RestController
@RequestMapping("/users")
class UserController(
    private val userService: UserService
) : BaseController() {

    @GetMapping("/{userId}")
    fun getUserProfile(
        @PathVariable userId: UUID
    ): ResponseEntity<UserEntity> {
        return try {
            val user = userService.findById(userId)
                ?: return ResponseEntity.notFound().build()

            ResponseEntity.ok(user)
        } catch (e: Exception) {
            ResponseEntity.badRequest().build()
        }
    }

    @PutMapping("/{userId}")
    fun updateUserProfile(
        @PathVariable userId: UUID,
        @Valid @RequestBody updates: UserProfileUpdateRequest
    ): ResponseEntity<UserEntity> {
        return try {
            val updatedUser = userService.updateProfile(userId, updates)
                ?: return ResponseEntity.notFound().build()

            ResponseEntity.ok(updatedUser)
        } catch (e: Exception) {
            ResponseEntity.badRequest().build()
        }
    }

    @PutMapping("/{userId}/settings")
    fun updateUserSettings(
        @PathVariable userId: UUID,
        @Valid @RequestBody settings: UserSettingsUpdateRequest
    ): ResponseEntity<UserEntity> {
        return try {
            val updatedUser = userService.updateSettings(userId, settings)
                ?: return ResponseEntity.notFound().build()

            ResponseEntity.ok(updatedUser)
        } catch (e: Exception) {
            ResponseEntity.badRequest().build()
        }
    }

    @PostMapping("/{userId}/avatar")
    fun uploadAvatar(
        @PathVariable userId: UUID,
        @RequestBody avatarData: Map<String, String>
    ): ResponseEntity<Map<String, String>> {
        return try {
            val avatarUrl = avatarData["avatarUrl"]
                ?: return ResponseEntity.badRequest().body(mapOf("error" to "Avatar URL required"))

            userService.updateAvatar(userId, avatarUrl)
            ResponseEntity.ok(mapOf(
                "message" to "Avatar uploaded successfully",
                "avatarUrl" to avatarUrl,
                "userId" to userId.toString()
            ))
        } catch (e: Exception) {
            ResponseEntity.badRequest().body(mapOf("error" to "Failed to upload avatar"))
        }
    }

    @DeleteMapping("/{userId}/avatar")
    fun deleteAvatar(
        @PathVariable userId: UUID
    ): ResponseEntity<Map<String, String>> {
        return try {
            userService.removeAvatar(userId)
            ResponseEntity.ok(mapOf(
                "message" to "Avatar deleted successfully",
                "userId" to userId.toString()
            ))
        } catch (e: Exception) {
            ResponseEntity.badRequest().body(mapOf("error" to "Failed to delete avatar"))
        }
    }

    @DeleteMapping("/{userId}")
    fun deactivateUser(
        @PathVariable userId: UUID
    ): ResponseEntity<Map<String, String>> {
        return try {
            userService.deactivateUser(userId)
            ResponseEntity.ok(mapOf(
                "message" to "User deactivated successfully",
                "userId" to userId.toString()
            ))
        } catch (e: Exception) {
            ResponseEntity.badRequest().body(mapOf("error" to "Failed to deactivate user"))
        }
    }
}