package com.backend.core.opportunity

import com.backend.core.company.CompanyEntity
import com.backend.core.contact.ContactEntity
import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "opportunities", indexes = [
    Index(columnList = "tenant_id"),
    Index(columnList = "owner_id"),
    Index(columnList = "company_id"),
    Index(columnList = "contact_id")
])
data class OpportunityEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(name = "tenant_id", nullable = false, columnDefinition = "UUID")
    val tenantId: UUID,

    @Column(name = "owner_id", nullable = false, columnDefinition = "UUID")
    val ownerId: UUID,

    @Column(name = "company_id", columnDefinition = "UUID", insertable = false, updatable = false)
    val companyId: UUID? = null,

    @Column(name = "contact_id", columnDefinition = "UUID", insertable = false, updatable = false)
    val contactId: UUID? = null,

    @Column(nullable = false, length = 255)
    val name: String,

    @Column(columnDefinition = "TEXT")
    val description: String? = null,

    @Enumerated(EnumType.STRING)
    val stage: OpportunityStage = OpportunityStage.PROSPECTING,

    @Column(precision = 15, scale = 2)
    val amount: BigDecimal? = null,

    val probability: Int = 0,

    @Column(name = "close_date")
    val closeDate: LocalDate? = null,

    @Column(name = "expected_revenue", precision = 15, scale = 2)
    val expectedRevenue: BigDecimal? = null,

    @Column(name = "is_closed")
    val isClosed: Boolean = false,

    @Column(name = "is_won")
    val isWon: Boolean = false,

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
    val company: CompanyEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contact_id", nullable = true)
    val contact: ContactEntity? = null
) {
    enum class OpportunityStage { PROSPECTING, QUALIFICATION, PROPOSAL, NEGOTIATION, CLOSED_WON, CLOSED_LOST }
    enum class OpportunityType { NEW_BUSINESS, EXISTING_BUSINESS, RENEWAL, UPSELL, CROSS_SELL }
    enum class LeadSource { WEBSITE, REFERRAL, COLD_CALL, EMAIL, SOCIAL_MEDIA, CONFERENCE, PARTNER, OTHER }
}