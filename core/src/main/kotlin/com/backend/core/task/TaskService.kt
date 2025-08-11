package com.backend.core.task

import com.backend.core.tenant.TenantService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.util.*

@Service
@Transactional
class TaskService(
    private val taskRepository: TaskRepository,
    private val tenantService: TenantService
) {
    fun getAllTasks(tenantId: UUID): List<Task> = taskRepository.findByTenantId(tenantId)

    fun getTaskById(id: UUID, tenantId: UUID): Task {
        val task = taskRepository.findById(id).orElseThrow { TaskNotFoundException("Task not found") }
        if (task.tenantId != tenantId) throw SecurityException("Access denied")
        return task
    }

    fun createTask(task: Task, tenantId: UUID): Task {
        tenantService.getTenantById(tenantId) ?: throw IllegalArgumentException("Invalid tenant")
        tenantService.validateTenantLimits(tenantId) // Check tenant limits
        val newTask = task.copy(
            id = UUID.randomUUID(),
            tenantId = tenantId,
            createdAt = LocalDateTime.now()
        )
        return taskRepository.save(newTask)
    }

    fun updateTask(id: UUID, task: Task, tenantId: UUID): Task {
        val existingTask = getTaskById(id, tenantId)
        tenantService.validateTenantLimits(tenantId) // Check tenant limits
        val updatedTask = existingTask.copy(
            title = task.title,
            description = task.description,
            status = task.status,
            priority = task.priority,
            assignedTo = task.assignedTo,
            dueDate = task.dueDate
        )
        return taskRepository.save(updatedTask)
    }

    fun deleteTask(id: UUID, tenantId: UUID) {
        val task = getTaskById(id, tenantId)
        taskRepository.delete(task)
    }

    fun getTasksByStatus(status: Task.TaskStatus, tenantId: UUID): List<Task> {
        return taskRepository.findByTenantIdAndStatus(tenantId, status)
    }
}

class TaskNotFoundException(message: String) : RuntimeException(message)