package com.backend.core.tenant

import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.*

@Entity
@Table(name = "tenants", indexes = [
    Index(columnList = "subdomain", unique = true),
    Index(columnList = "name", unique = true)
])
data class TenantEntity(
    @Id
    @Column(columnDefinition = "UUID")
    val id: UUID = UUID.randomUUID(),

    @Column(nullable = false, unique = true, length = 100)
    val name: String,

    @Column(nullable = false, unique = true, length = 100)
    val subdomain: String,

    @Column(nullable = false, length = 255)
    val displayName: String,

    @Column(columnDefinition = "TEXT")
    val description: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "subscription_plan")
    val subscriptionPlan: SubscriptionPlan = SubscriptionPlan.TRIAL,

    @Column(name = "max_users")
    val maxUsers: Int = 5,

    @Column(name = "max_opportunities")
    val maxOpportunities: Int = 200,

    @Column(name = "max_companies")
    val maxCompanies: Int = 500,

    @Column(name = "max_contacts")
    val maxContacts: Int = 1000,

    @Column(name = "max_tasks")
    val maxTasks: Int = 2000,

    @Column(name = "is_active")
    val isActive: Boolean = true,

    @Column(name = "is_trial")
    val isTrial: Boolean? = true,

    @Column(name = "trial_ends_at")
    val trialEndsAt: LocalDateTime? = LocalDateTime.now().plusDays(30),

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @UpdateTimestamp
    @Column(name = "updated_at")
    val updatedAt: LocalDateTime = LocalDateTime.now()
) {
    enum class SubscriptionPlan { TRIAL, BASIC, PROFESSIONAL, ENTERPRISE }
}