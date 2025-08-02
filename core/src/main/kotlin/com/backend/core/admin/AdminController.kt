package com.backend.core.admin

import com.backend.core.chat.ChatAssignmentService
import com.backend.core.user.UserEntity
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import java.util.*

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ADMIN')")
class AdminController @Autowired constructor(
    private val chatAssignmentService: ChatAssignmentService
) {

    @PostMapping("/assign-chat")
    fun assignChat(
        @RequestBody request: AssignChatRequest,
        @AuthenticationPrincipal currentUser: UserEntity
    ): ResponseEntity<AssignChatResponse> {
        return try {
            val assignment = chatAssignmentService.assignChatToManager(
                threadId = request.threadId,
                managerId = request.managerId,
                assignedBy = currentUser
            )
            
            ResponseEntity.ok(AssignChatResponse(
                success = true,
                message = "Chat assigned successfully",
                assignmentId = assignment.id
            ))
        } catch (e: Exception) {
            ResponseEntity.badRequest().body(AssignChatResponse(
                success = false,
                message = e.message ?: "Failed to assign chat"
            ))
        }
    }

    @DeleteMapping("/unassign-chat")
    fun unassignChat(@RequestBody request: UnassignChatRequest): ResponseEntity<UnassignChatResponse> {
        return try {
            val success = chatAssignmentService.unassignChatFromManager(
                threadId = request.threadId,
                managerId = request.managerId
            )
            
            if (success) {
                ResponseEntity.ok(UnassignChatResponse(
                    success = true,
                    message = "Chat unassigned successfully"
                ))
            } else {
                ResponseEntity.badRequest().body(UnassignChatResponse(
                    success = false,
                    message = "Assignment not found or already inactive"
                ))
            }
        } catch (e: Exception) {
            ResponseEntity.badRequest().body(UnassignChatResponse(
                success = false,
                message = e.message ?: "Failed to unassign chat"
            ))
        }
    }

    @GetMapping("/managers")
    fun getAllManagers(): ResponseEntity<List<ManagerInfo>> {
        val managers = chatAssignmentService.getAllManagers().map { manager ->
            val assignments = chatAssignmentService.getManagerAssignments(manager.id)
            ManagerInfo(
                id = manager.id,
                email = manager.email,
                fullName = manager.fullName,
                assignedChatsCount = assignments.size
            )
        }
        
        return ResponseEntity.ok(managers)
    }

    @GetMapping("/chat-assignments/{threadId}")
    fun getChatAssignments(@PathVariable threadId: String): ResponseEntity<List<ChatAssignmentInfo>> {
        val assignments = chatAssignmentService.getChatAssignments(threadId).map { assignment ->
            ChatAssignmentInfo(
                id = assignment.id,
                managerId = assignment.manager.id,
                managerEmail = assignment.manager.email,
                managerName = assignment.manager.fullName,
                assignedAt = assignment.assignedAt,
                assignedBy = assignment.assignedBy.fullName
            )
        }
        
        return ResponseEntity.ok(assignments)
    }
}

// DTOs
data class AssignChatRequest(
    val threadId: String,
    val managerId: UUID
)

data class AssignChatResponse(
    val success: Boolean,
    val message: String,
    val assignmentId: UUID? = null
)

data class UnassignChatRequest(
    val threadId: String,
    val managerId: UUID
)

data class UnassignChatResponse(
    val success: Boolean,
    val message: String
)

data class ManagerInfo(
    val id: UUID,
    val email: String,
    val fullName: String,
    val assignedChatsCount: Int
)

data class ChatAssignmentInfo(
    val id: UUID,
    val managerId: UUID,
    val managerEmail: String,
    val managerName: String,
    val assignedAt: java.time.LocalDateTime,
    val assignedBy: String
)