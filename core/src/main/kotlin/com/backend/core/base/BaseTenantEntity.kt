package com.backend.core.base

import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.*

@MappedSuperclass
abstract class BaseTenantEntity {
    @Id
    @Column(columnDefinition = "UUID")
    open val id: UUID = UUID.randomUUID()

    @Column(name = "tenant_id", nullable = false, columnDefinition = "UUID")
    open val tenantId: UUID? = null

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    open val createdAt: LocalDateTime = LocalDateTime.now()

    @UpdateTimestamp
    @Column(name = "updated_at")
    open val updatedAt: LocalDateTime = LocalDateTime.now()
}
