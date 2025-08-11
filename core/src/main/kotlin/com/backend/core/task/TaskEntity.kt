package com.backend.core.task

import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "tasks", indexes = [
    Index(columnList = "tenant_id"),
    Index(columnList = "assigned_to")
])
data class Task(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(nullable = false)
    var title: String,

    @Column(columnDefinition = "TEXT")
    var description: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: TaskStatus,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var priority: TaskPriority,

    @Column(name = "assigned_to", columnDefinition = "UUID")
    var assignedTo: UUID? = null,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @Column(name = "due_date")
    val dueDate: LocalDate? = null,

    @Column(name = "tenant_id", nullable = false, columnDefinition = "UUID")
    var tenantId: UUID,

    @UpdateTimestamp
    @Column(name = "updated_at")
    val updatedAt: LocalDateTime = LocalDateTime.now()
) {
    enum class TaskStatus { TO_DO, IN_PROGRESS, REVIEW, DONE }
    enum class TaskPriority { LOW, MEDIUM, HIGH, CRITICAL }
}