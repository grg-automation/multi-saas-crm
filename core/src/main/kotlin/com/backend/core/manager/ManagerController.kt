package com.backend.core.manager

import com.backend.core.chat.ChatAssignmentService
import com.backend.core.user.UserEntity
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*

data class AssignedThreadInfo(
    val threadId: String,
    val assignedAt: java.time.LocalDateTime,
    val assignedBy: String
)

data class ManagerInboxResponse(
    val success: Boolean,
    val data: Map<String, Any>? = null,
    val error: String? = null
)

@RestController
@RequestMapping("/api/v1/manager")
@PreAuthorize("hasRole('MANAGER')")
class ManagerController(
    private val chatAssignmentService: ChatAssignmentService
) {

    /**
     * Get assigned threads for current manager
     */
    @GetMapping("/assigned-threads")
    fun getAssignedThreads(
        @AuthenticationPrincipal currentUser: UserEntity
    ): ResponseEntity<ManagerInboxResponse> {
        return try {
            val assignments = chatAssignmentService.getManagerAssignments(currentUser.id!!)
            
            val threadInfos = assignments.map { assignment ->
                AssignedThreadInfo(
                    threadId = assignment.threadId,
                    assignedAt = assignment.assignedAt,
                    assignedBy = assignment.assignedBy.fullName
                )
            }
            
            val response = ManagerInboxResponse(
                success = true,
                data = mapOf(
                    "assignedThreads" to threadInfos,
                    "totalCount" to threadInfos.size
                )
            )
            
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = ManagerInboxResponse(
                success = false,
                error = e.message ?: "Failed to get assigned threads"
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    /**
     * Get assigned thread IDs only (for filtering Telegram chats)
     */
    @GetMapping("/assigned-thread-ids")
    fun getAssignedThreadIds(
        @AuthenticationPrincipal currentUser: UserEntity
    ): ResponseEntity<ManagerInboxResponse> {
        return try {
            val threadIds = chatAssignmentService.getAssignedThreadIds(currentUser.id!!)
            
            val response = ManagerInboxResponse(
                success = true,
                data = mapOf(
                    "threadIds" to threadIds,
                    "count" to threadIds.size
                )
            )
            
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = ManagerInboxResponse(
                success = false,
                error = e.message ?: "Failed to get assigned thread IDs"
            )
            ResponseEntity.badRequest().body(response)
        }
    }
}