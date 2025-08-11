package com.backend.core.contact

import com.backend.core.company.CompanyEntity
import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(
    name = "contacts", indexes = [
        Index(columnList = "tenant_id"),
        Index(columnList = "owner_id"),
        Index(columnList = "company_id"),
        Index(columnList = "email")
    ]
)
data class ContactEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(name = "tenant_id", nullable = false, columnDefinition = "UUID")
    val tenantId: UUID,

    @Column(name = "owner_id", nullable = false, columnDefinition = "UUID")
    val ownerId: UUID,

    @Column(name = "company_id", columnDefinition = "UUID", insertable = false, updatable = false)
    val companyId: UUID? = null,

    @Column(name = "first_name", nullable = false, length = 100)
    val firstName: String,

    @Column(name = "last_name", nullable = false, length = 100)
    val lastName: String,

    @Column(unique = false, length = 255)
    val email: String? = null,

    @Column(length = 20)
    val phone: String? = null,

    @Column(length = 20)
    val mobile: String? = null,

    @Column(name = "title", length = 100)
    val title: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "contact_type")
    val contactType: ContactType = ContactType.LEAD,

    @Column(name = "is_active")
    val isActive: Boolean = true,

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @UpdateTimestamp
    @Column(name = "updated_at")
    val updatedAt: LocalDateTime = LocalDateTime.now(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = true)
    val company: CompanyEntity? = null
) {
    val fullName: String
        get() = "$firstName $lastName".trim()
}

enum class ContactType { LEAD, CUSTOMER, PARTNER, VENDOR, EMPLOYEE }