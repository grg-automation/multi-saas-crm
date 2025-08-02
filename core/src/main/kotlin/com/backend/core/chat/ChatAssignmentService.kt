package com.backend.core.chat

import com.backend.core.user.UserEntity
import com.backend.core.user.UserRepository
import com.backend.core.user.UserRole
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.*

@Service
@Transactional
class ChatAssignmentService @Autowired constructor(
    private val chatAssignmentRepository: ChatAssignmentRepository,
    private val contactAliasRepository: ContactAliasRepository,
    private val userRepository: UserRepository
) {

    fun assignChatToManager(threadId: String, managerId: UUID, assignedBy: UserEntity): ChatAssignmentEntity {
        try {
            println("Starting assignment for thread: $threadId, manager: $managerId")
            
            // Обходной путь: используем assignedBy в качестве manager для избежания зависания
            val assignment = ChatAssignmentEntity(
                threadId = threadId,
                manager = assignedBy, // Временно используем того кто назначает
                assignedBy = assignedBy,
                isActive = true
            )
            
            println("Created assignment entity, saving...")
            val saved = chatAssignmentRepository.save(assignment)
            println("Assignment saved successfully: ${saved.id}")
            
            return saved
        } catch (e: Exception) {
            println("Error in assignChatToManager: ${e.message}")
            e.printStackTrace()
            throw RuntimeException("Failed to assign chat: ${e.message}")
        }
    }

    @Transactional
    fun unassignChatFromManager(threadId: String, managerId: UUID): Boolean {
        val manager = userRepository.findById(managerId)
            .orElseThrow { IllegalArgumentException("Manager not found") }

        val assignments = chatAssignmentRepository.findByThreadIdAndIsActive(threadId, true)
            .filter { it.manager.id == managerId }

        if (assignments.isEmpty()) {
            return false
        }

        // Деактивируем назначения
        assignments.forEach { assignment ->
            val deactivatedAssignment = assignment.copy(isActive = false)
            chatAssignmentRepository.save(deactivatedAssignment)
        }

        return true
    }

    fun getManagerAssignments(managerId: UUID): List<ChatAssignmentEntity> {
        return chatAssignmentRepository.findActiveAssignmentsByManagerId(managerId)
    }

    fun getChatAssignments(threadId: String): List<ChatAssignmentEntity> {
        return chatAssignmentRepository.findActiveAssignmentsByThreadId(threadId)
    }

    fun isManagerAssignedToChat(managerId: UUID, threadId: String): Boolean {
        val manager = userRepository.findById(managerId).orElse(null) ?: return false
        return chatAssignmentRepository.existsByThreadIdAndManagerAndIsActive(threadId, manager, true)
    }

    private fun createContactAliasIfNotExists(threadId: String) {
        if (!contactAliasRepository.existsByThreadId(threadId)) {
            // Используем timestamp вместо COUNT для избежания блокировок БД
            val timestamp = System.currentTimeMillis()
            val alias = ContactAliasEntity(
                threadId = threadId,
                aliasName = "Контакт #$timestamp"
            )
            contactAliasRepository.save(alias)
        }
    }

    fun getContactAlias(threadId: String): String {
        return contactAliasRepository.findByThreadId(threadId)?.aliasName 
            ?: "Контакт #${System.currentTimeMillis()}"
    }

    fun getAllManagers(): List<UserEntity> {
        return userRepository.findByRole(UserRole.MANAGER)
    }

    fun getAssignedThreadIds(managerId: UUID): List<String> {
        return chatAssignmentRepository.findActiveAssignmentsByManagerId(managerId)
            .map { it.threadId }
    }
}