package com.backend.core.company

import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.*

@RestController
@RequestMapping("/companies")
class CompanyController(
    private val companyService: CompanyService
) {
    @GetMapping
    fun getAllCompanies(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @RequestParam(required = false) search: String?
    ): ResponseEntity<List<CompanyEntity>> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val companies = if (search.isNullOrBlank()) {
                companyService.getAllCompanies(tenantUUID)
            } else {
                companyService.searchCompanies(tenantUUID, search)
            }
            ResponseEntity.ok(companies)
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @GetMapping("/{id}")
    fun getCompanyById(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String
    ): ResponseEntity<CompanyEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val companyUUID = validateUUID(id)
            companyService.getCompanyById(tenantUUID, companyUUID)?.let { ResponseEntity.ok(it) }
                ?: ResponseEntity.notFound().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @PostMapping
    fun createCompany(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @RequestHeader("X-User-ID") userId: String,
        @Valid @RequestBody company: CompanyEntity
    ): ResponseEntity<CompanyEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val userUUID = validateUUID(userId)
            val newCompany = company.copy(
                id = UUID.randomUUID(),
                tenantId = tenantUUID,
                ownerId = userUUID
            )
            val savedCompany = companyService.createCompany(newCompany)
            ResponseEntity.status(HttpStatus.CREATED).body(savedCompany)
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @PutMapping("/{id}")
    fun updateCompany(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String,
        @Valid @RequestBody updates: CompanyEntity
    ): ResponseEntity<CompanyEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val companyUUID = validateUUID(id)
            companyService.updateCompany(tenantUUID, companyUUID, updates)?.let { ResponseEntity.ok(it) }
                ?: ResponseEntity.notFound().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @DeleteMapping("/{id}")
    fun deleteCompany(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String
    ): ResponseEntity<Void> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val companyUUID = validateUUID(id)
            if (companyService.deleteCompany(tenantUUID, companyUUID)) {
                ResponseEntity.noContent().build()
            } else {
                ResponseEntity.notFound().build()
            }
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    private fun validateUUID(uuidStr: String): UUID {
        return try {
            UUID.fromString(uuidStr)
        } catch (e: IllegalArgumentException) {
            throw IllegalArgumentException("Invalid UUID format: $uuidStr")
        }
    }
}