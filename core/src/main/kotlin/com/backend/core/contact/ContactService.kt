package com.backend.core.contact

import com.backend.core.company.CompanyRepository
import com.backend.core.tenant.TenantService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.util.*

@Service
@Transactional
class ContactService(
    private val contactRepository: ContactRepository,
    private val companyRepository: CompanyRepository,
    private val tenantService: TenantService
) {
    fun getAllContacts(tenantId: UUID): List<ContactEntity> = contactRepository.findByTenantId(tenantId)

    fun getContactById(tenantId: UUID, contactId: UUID): ContactEntity? =
        contactRepository.findByTenantIdAndId(tenantId, contactId)

    fun searchContacts(tenantId: UUID, search: String): List<ContactEntity> =
        contactRepository.searchByTenantId(tenantId, search)

    fun createContact(contact: ContactEntity): ContactEntity {
        tenantService.validateTenantLimits(contact.tenantId) // Check tenant limits
        contact.email?.let { email ->
            contactRepository.findByTenantIdAndEmail(contact.tenantId, email)?.let {
                throw IllegalArgumentException("Email already exists")
            }
        }
        contact.companyId?.let { companyId ->
            if (!companyRepository.existsById(companyId)) {
                throw IllegalArgumentException("Company not found")
            }
        }
        return contactRepository.save(contact)
    }

    fun updateContact(tenantId: UUID, contactId: UUID, updates: ContactEntity): ContactEntity? {
        val existing = contactRepository.findByTenantIdAndId(tenantId, contactId) ?: return null
        tenantService.validateTenantLimits(tenantId) // Check tenant limits
        updates.email?.let { newEmail ->
            if (newEmail != existing.email && contactRepository.findByTenantIdAndEmail(tenantId, newEmail) != null) {
                throw IllegalArgumentException("Email already exists")
            }
        }
        updates.companyId?.let { newCompanyId ->
            if (newCompanyId != existing.companyId && !companyRepository.existsById(newCompanyId)) {
                throw IllegalArgumentException("Company not found")
            }
        }
        val updated = existing.copy(
            firstName = updates.firstName.takeIf { it.isNotBlank() } ?: existing.firstName,
            lastName = updates.lastName.takeIf { it.isNotBlank() } ?: existing.lastName,
            email = updates.email,
            phone = updates.phone,
            mobile = updates.mobile,
            contactType = updates.contactType,
            companyId = updates.companyId,
            updatedAt = LocalDateTime.now()
        )
        return contactRepository.save(updated)
    }

    fun deleteContact(tenantId: UUID, contactId: UUID): Boolean {
        val contact = contactRepository.findByTenantIdAndId(tenantId, contactId) ?: return false
        contactRepository.delete(contact)
        return true
    }
}