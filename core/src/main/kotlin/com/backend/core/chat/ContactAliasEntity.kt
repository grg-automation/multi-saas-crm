package com.backend.core.chat

import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "contact_aliases")
data class ContactAliasEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(name = "thread_id", unique = true, nullable = false)
    val threadId: String,

    @Column(name = "alias_name", nullable = false, length = 100)
    val aliasName: String,

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now()
)