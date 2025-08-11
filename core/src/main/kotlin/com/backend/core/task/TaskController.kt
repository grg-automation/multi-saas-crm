package com.backend.core.task

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.*

@RestController
@RequestMapping("/api/v1/tasks")
class TaskController(
    private val taskService: TaskService
) {
    @GetMapping
    fun getAllTasks(@RequestHeader("X-Tenant-ID") tenantId: String): ResponseEntity<List<Task>> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            ResponseEntity.ok(taskService.getAllTasks(tenantUUID))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @GetMapping("/{id}")
    fun getTaskById(@PathVariable id: UUID, @RequestHeader("X-Tenant-ID") tenantId: String): ResponseEntity<Task> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            ResponseEntity.ok(taskService.getTaskById(id, tenantUUID))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        } catch (e: RuntimeException) {
            ResponseEntity.notFound().build()
        }
    }

    @PostMapping
    fun createTask(@RequestBody task: Task, @RequestHeader("X-Tenant-ID") tenantId: String): ResponseEntity<Task> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            ResponseEntity.status(HttpStatus.CREATED).body(taskService.createTask(task, tenantUUID))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @PutMapping("/{id}")
    fun updateTask(@PathVariable id: UUID, @RequestBody task: Task, @RequestHeader("X-Tenant-ID") tenantId: String): ResponseEntity<Task> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            ResponseEntity.ok(taskService.updateTask(id, task, tenantUUID))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        } catch (e: RuntimeException) {
            ResponseEntity.notFound().build()
        }
    }

    @DeleteMapping("/{id}")
    fun deleteTask(@PathVariable id: UUID, @RequestHeader("X-Tenant-ID") tenantId: String): ResponseEntity<Void> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            taskService.deleteTask(id, tenantUUID)
            ResponseEntity.noContent().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        } catch (e: RuntimeException) {
            ResponseEntity.notFound().build()
        }
    }

    @GetMapping("/status/{status}")
    fun getTasksByStatus(@PathVariable status: Task.TaskStatus, @RequestHeader("X-Tenant-ID") tenantId: String): ResponseEntity<List<Task>> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            ResponseEntity.ok(taskService.getTasksByStatus(status, tenantUUID))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    private fun validateUUID(uuidStr: String): UUID {
        return try {
            UUID.fromString(uuidStr)
        } catch (e: IllegalArgumentException) {
            throw IllegalArgumentException("Invalid UUID format: $uuidStr")
        }
    }
}