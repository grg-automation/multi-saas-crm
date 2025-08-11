package com.backend.core.company

import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "companies", indexes = [
    Index(columnList = "tenant_id"),
    Index(columnList = "owner_id"),
    Index(columnList = "email", unique = true)
])
data class CompanyEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(name = "tenant_id", nullable = false, columnDefinition = "UUID")
    val tenantId: UUID,

    @Column(name = "owner_id", nullable = false, columnDefinition = "UUID")
    val ownerId: UUID,

    @Column(nullable = false, length = 255)
    val name: String,

    @Column(name = "legal_name", length = 255)
    val legalName: String? = null,

    @Column(columnDefinition = "TEXT")
    val description: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "company_type")
    val companyType: CompanyType = CompanyType.PROSPECT,

    @Column(length = 255)
    val email: String? = null,

    @Column(length = 20)
    val phone: String? = null,

    @Column(name = "is_active")
    val isActive: Boolean = true,

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @UpdateTimestamp
    @Column(name = "updated_at")
    val updatedAt: LocalDateTime = LocalDateTime.now()
) {
    enum class CompanyType { CUSTOMER, PARTNER, VENDOR, COMPETITOR, PROSPECT }
}