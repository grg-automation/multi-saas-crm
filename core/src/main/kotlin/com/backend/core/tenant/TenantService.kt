package com.backend.core.tenant

import com.backend.core.task.TaskRepository
import com.backend.core.user.UserRepository
import com.backend.core.company.CompanyRepository
import com.backend.core.contact.ContactRepository
import com.backend.core.opportunity.OpportunityRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.util.*

@Service
@Transactional
class TenantService(
    private val tenantRepository: TenantRepository,
    private val taskRepository: TaskRepository,
    private val userRepository: UserRepository,
    private val companyRepository: CompanyRepository,
    private val contactRepository: ContactRepository,
    private val opportunityRepository: OpportunityRepository
) {
    data class CreateTenantRequest(
        val name: String,
        val subdomain: String,
        val displayName: String,
        val description: String? = null,
        val subscriptionPlan: TenantEntity.SubscriptionPlan? = null
    )

    data class UpdateTenantRequest(
        val displayName: String? = null,
        val description: String? = null,
        val subscriptionPlan: TenantEntity.SubscriptionPlan? = null,
        val maxUsers: Int? = null,
        val maxOpportunities: Int? = null,
        val maxCompanies: Int? = null,
        val maxContacts: Int? = null,
        val maxTasks: Int? = null
    )

    data class TenantUsage(
        val tenantId: UUID,
        val activeUserCount: Int,
        val maxUsers: Int,
        val activeTaskCount: Int,
        val maxOpportunities: Int
    )

    data class TenantLimitValidation(
        val isValid: Boolean,
        val violations: List<String>
    )

    fun createTenant(request: CreateTenantRequest, trialDays: Int = 30): TenantEntity {
        if (tenantRepository.findBySubdomain(request.subdomain) != null) {
            throw IllegalArgumentException("Subdomain '${request.subdomain}' is already taken")
        }
        if (tenantRepository.findByName(request.name) != null) {
            throw IllegalArgumentException("Tenant name '${request.name}' is already taken")
        }
        val tenant = TenantEntity(
            name = request.name,
            subdomain = request.subdomain,
            displayName = request.displayName,
            description = request.description,
            subscriptionPlan = request.subscriptionPlan ?: TenantEntity.SubscriptionPlan.TRIAL,
            trialEndsAt = if (request.subscriptionPlan == TenantEntity.SubscriptionPlan.TRIAL || request.subscriptionPlan == null) {
                LocalDateTime.now().plusDays(trialDays.toLong())
            } else null
        )
        return tenantRepository.save(tenant)
    }

    @Transactional(readOnly = true)
    fun getTenantBySubdomain(subdomain: String): TenantEntity? {
        return tenantRepository.findBySubdomain(subdomain)
    }

    @Transactional(readOnly = true)
    fun getTenantById(id: UUID): TenantEntity? {
        return tenantRepository.findById(id).orElse(null)
    }

    @Transactional(readOnly = true)
    fun getAllActiveTenants(): List<TenantEntity> {
        return tenantRepository.findAllActive()
    }

    fun updateTenant(id: UUID, request: UpdateTenantRequest): TenantEntity {
        val tenant = tenantRepository.findById(id)
            .orElseThrow { IllegalArgumentException("Tenant not found") }
        val usage = getTenantUsage(id)
        val updatedTenant = tenant.copy(
            displayName = request.displayName ?: tenant.displayName,
            description = request.description ?: tenant.description,
            subscriptionPlan = request.subscriptionPlan ?: tenant.subscriptionPlan,
            maxUsers = request.maxUsers?.takeIf { it >= usage.activeUserCount } ?: tenant.maxUsers,
            maxOpportunities = request.maxOpportunities?.takeIf { it >= getOpportunityCount(id).toInt() } ?: tenant.maxOpportunities,
            maxCompanies = request.maxCompanies?.takeIf { it >= getCompanyCount(id).toInt() } ?: tenant.maxCompanies,
            maxContacts = request.maxContacts?.takeIf { it >= getContactCount(id).toInt() } ?: tenant.maxContacts,
            maxTasks = request.maxTasks?.takeIf { it >= usage.activeTaskCount } ?: tenant.maxTasks
        )
        return tenantRepository.save(updatedTenant)
    }

    fun deactivateTenant(id: UUID) {
        val tenant = tenantRepository.findById(id)
            .orElseThrow { IllegalArgumentException("Tenant not found") }
        tenantRepository.save(tenant.copy(isActive = false))
    }

    fun activateTenant(id: UUID) {
        val tenant = tenantRepository.findById(id)
            .orElseThrow { IllegalArgumentException("Tenant not found") }
        tenantRepository.save(tenant.copy(isActive = true))
    }

    @Transactional(readOnly = true)
    fun getTenantUsage(tenantId: UUID): TenantUsage {
        val tenant = getTenantById(tenantId) ?: throw IllegalArgumentException("Tenant not found")
        val activeUserCount = userRepository.countByIsActiveAndTenantId(true, tenantId).toInt()
        val activeTaskCount = getActiveTaskCount(tenantId).toInt()
        return TenantUsage(
            tenantId = tenantId,
            activeUserCount = activeUserCount,
            maxUsers = tenant.maxUsers,
            activeTaskCount = activeTaskCount,
            maxOpportunities = tenant.maxOpportunities
        )
    }

    fun validateTenantLimits(tenantId: UUID): TenantLimitValidation {
        val tenant = getTenantById(tenantId) ?: throw IllegalArgumentException("Tenant not found")
        val usage = getTenantUsage(tenantId)
        val violations = mutableListOf<String>()

        if (usage.activeUserCount >= tenant.maxUsers) {
            violations.add("User limit exceeded (${usage.activeUserCount}/${tenant.maxUsers})")
        }
        if (getCompanyCount(tenantId) >= tenant.maxCompanies) {
            violations.add("Company limit exceeded (${getCompanyCount(tenantId)}/${tenant.maxCompanies})")
        }
        if (getContactCount(tenantId) >= tenant.maxContacts) {
            violations.add("Contact limit exceeded (${getContactCount(tenantId)}/${tenant.maxContacts})")
        }
        if (getOpportunityCount(tenantId) >= tenant.maxOpportunities) {
            violations.add("Opportunity limit exceeded (${getOpportunityCount(tenantId)}/${tenant.maxOpportunities})")
        }
        if (usage.activeTaskCount >= tenant.maxTasks) {
            violations.add("Task limit exceeded (${usage.activeTaskCount}/${tenant.maxTasks})")
        }

        return TenantLimitValidation(isValid = violations.isEmpty(), violations = violations)
    }

    fun extendTrial(tenantId: UUID, days: Int) {
        val tenant = getTenantById(tenantId) ?: throw IllegalArgumentException("Tenant not found")
        val newTrialEnd = (tenant.trialEndsAt ?: LocalDateTime.now()).plusDays(days.toLong())
        tenantRepository.save(tenant.copy(trialEndsAt = newTrialEnd))
    }

    @Transactional(readOnly = true)
    fun findExpiredTrials(): List<TenantEntity> {
        return tenantRepository.findExpiredTrials()
    }

    // Resource counting methods
    @Transactional(readOnly = true)
    fun getCompanyCount(tenantId: UUID): Long {
        return companyRepository.countByTenantId(tenantId)
    }

    @Transactional(readOnly = true)
    fun getContactCount(tenantId: UUID): Long {
        return contactRepository.countByTenantId(tenantId)
    }

    @Transactional(readOnly = true)
    fun getOpportunityCount(tenantId: UUID): Long {
        return opportunityRepository.countByTenantId(tenantId)
    }

    @Transactional(readOnly = true)
    fun getActiveTaskCount(tenantId: UUID): Long {
        // Get count of non-completed tasks
        return taskRepository.findByTenantId(tenantId).count { task ->
            task.status != com.backend.core.task.Task.TaskStatus.DONE
        }.toLong()
    }
}