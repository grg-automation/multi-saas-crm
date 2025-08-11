package com.backend.core.opportunity

import com.backend.core.company.CompanyRepository
import com.backend.core.contact.ContactRepository
import com.backend.core.tenant.TenantService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.*

@Service
@Transactional
class OpportunityService(
    private val opportunityRepository: OpportunityRepository,
    private val companyRepository: CompanyRepository,
    private val contactRepository: ContactRepository,
    private val tenantService: TenantService
) {
    fun getAllOpportunities(tenantId: UUID): List<OpportunityEntity> = opportunityRepository.findByTenantId(tenantId)

    fun getOpportunityById(tenantId: UUID, opportunityId: UUID): OpportunityEntity? =
        opportunityRepository.findByTenantIdAndId(tenantId, opportunityId)

    fun getOpportunitiesByCompany(tenantId: UUID, companyId: UUID): List<OpportunityEntity> =
        opportunityRepository.findByTenantIdAndCompanyId(tenantId, companyId)

    fun getOpportunitiesByContact(tenantId: UUID, contactId: UUID): List<OpportunityEntity> =
        opportunityRepository.findByTenantIdAndContactId(tenantId, contactId)

    fun getActiveOpportunities(tenantId: UUID): List<OpportunityEntity> =
        opportunityRepository.findActiveByTenantId(tenantId)

    fun getOpenOpportunities(tenantId: UUID): List<OpportunityEntity> =
        opportunityRepository.findOpenOpportunitiesByTenantId(tenantId)

    fun searchOpportunities(tenantId: UUID, search: String): List<OpportunityEntity> =
        opportunityRepository.searchByTenantId(tenantId, search)

    fun getOpportunityCount(tenantId: UUID): Long = opportunityRepository.countByTenantId(tenantId)

    fun createOpportunity(opportunity: OpportunityEntity): OpportunityEntity {
        tenantService.validateTenantLimits(opportunity.tenantId) // Check tenant limits
        validateProbability(opportunity.probability)
        opportunity.companyId?.let { if (!companyRepository.existsById(it)) throw IllegalArgumentException("Company not found") }
        opportunity.contactId?.let { if (!contactRepository.existsById(it)) throw IllegalArgumentException("Contact not found") }
        val opportunityWithCalculatedFields = opportunity.copy(
            expectedRevenue = calculateExpectedRevenue(opportunity.amount, opportunity.probability),
            isClosed = isClosedStage(opportunity.stage),
            isWon = opportunity.stage == OpportunityEntity.OpportunityStage.CLOSED_WON
        )
        return opportunityRepository.save(opportunityWithCalculatedFields)
    }

    fun updateOpportunity(tenantId: UUID, opportunityId: UUID, updates: OpportunityEntity): OpportunityEntity? {
        val existing = opportunityRepository.findByTenantIdAndId(tenantId, opportunityId) ?: return null
        tenantService.validateTenantLimits(tenantId) // Check tenant limits
        validateProbability(updates.probability)
        updates.companyId?.let { if (it != existing.companyId && !companyRepository.existsById(it)) throw IllegalArgumentException("Company not found") }
        updates.contactId?.let { if (it != existing.contactId && !contactRepository.existsById(it)) throw IllegalArgumentException("Contact not found") }
        val updated = existing.copy(
            name = updates.name.takeIf { it.isNotBlank() } ?: existing.name,
            description = updates.description,
            stage = updates.stage,
            amount = updates.amount,
            probability = updates.probability,
            expectedRevenue = calculateExpectedRevenue(updates.amount, updates.probability),
            closeDate = updates.closeDate,
            isClosed = isClosedStage(updates.stage),
            isWon = updates.stage == OpportunityEntity.OpportunityStage.CLOSED_WON,
            updatedAt = LocalDateTime.now()
        )
        return opportunityRepository.save(updated)
    }

    fun deleteOpportunity(tenantId: UUID, opportunityId: UUID): Boolean {
        val opportunity = opportunityRepository.findByTenantIdAndId(tenantId, opportunityId) ?: return false
        opportunityRepository.delete(opportunity)
        return true
    }

    private fun validateProbability(probability: Int) {
        if (probability !in 0..100) {
            throw IllegalArgumentException("Probability must be between 0 and 100")
        }
    }

    private fun calculateExpectedRevenue(amount: BigDecimal?, probability: Int): BigDecimal? {
        return amount?.multiply(BigDecimal(probability))?.divide(BigDecimal(100))
    }

    private fun isClosedStage(stage: OpportunityEntity.OpportunityStage): Boolean {
        return stage == OpportunityEntity.OpportunityStage.CLOSED_WON || stage == OpportunityEntity.OpportunityStage.CLOSED_LOST
    }
}