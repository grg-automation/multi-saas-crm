package com.backend.core.company

import com.backend.core.tenant.TenantService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.util.*

@Service
@Transactional
class CompanyService(
    private val companyRepository: CompanyRepository,
    private val tenantService: TenantService
) {
    fun getAllCompanies(tenantId: UUID): List<CompanyEntity> = companyRepository.findByTenantId(tenantId)

    fun getCompanyById(tenantId: UUID, companyId: UUID): CompanyEntity? =
        companyRepository.findByTenantIdAndId(tenantId, companyId)

    fun searchCompanies(tenantId: UUID, search: String): List<CompanyEntity> =
        companyRepository.searchByTenantId(tenantId, search)

    fun getActiveCompanies(tenantId: UUID): List<CompanyEntity> =
        companyRepository.findActiveByTenantId(tenantId)

    fun getCompanyCount(tenantId: UUID): Long = companyRepository.countByTenantId(tenantId)

    fun createCompany(company: CompanyEntity): CompanyEntity {
        tenantService.validateTenantLimits(company.tenantId) // Check tenant limits
        company.email?.let { email ->
            if (companyRepository.existsByTenantIdAndEmail(company.tenantId, email)) {
                throw IllegalArgumentException("Company with email '$email' already exists")
            }
        }
        return companyRepository.save(company)
    }

    fun updateCompany(tenantId: UUID, companyId: UUID, updates: CompanyEntity): CompanyEntity? {
        val existing = companyRepository.findByTenantIdAndId(tenantId, companyId) ?: return null
        tenantService.validateTenantLimits(tenantId) // Check tenant limits
        updates.email?.let { newEmail ->
            if (newEmail != existing.email && companyRepository.existsByTenantIdAndEmail(tenantId, newEmail)) {
                throw IllegalArgumentException("Company with email '$newEmail' already exists")
            }
        }
        val updated = existing.copy(
            name = updates.name.takeIf { it.isNotBlank() } ?: existing.name,
            legalName = updates.legalName,
            description = updates.description,
            companyType = updates.companyType,
            email = updates.email,
            phone = updates.phone,
            updatedAt = LocalDateTime.now()
        )
        return companyRepository.save(updated)
    }

    fun deleteCompany(tenantId: UUID, companyId: UUID): Boolean {
        val company = companyRepository.findByTenantIdAndId(tenantId, companyId) ?: return false
        companyRepository.delete(company)
        return true
    }
}