package com.backend.core.chat

import com.backend.core.user.UserEntity
import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "chat_assignments")
data class ChatAssignmentEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(name = "thread_id", nullable = false)
    val threadId: String,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_id", nullable = false)
    val manager: UserEntity,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_by", nullable = false)
    val assignedBy: UserEntity,

    @CreationTimestamp
    @Column(name = "assigned_at", updatable = false)
    val assignedAt: LocalDateTime = LocalDateTime.now(),

    @Column(name = "is_active")
    val isActive: Boolean = true
)