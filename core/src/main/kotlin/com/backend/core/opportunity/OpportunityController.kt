package com.backend.core.opportunity

import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.*

@RestController
@RequestMapping("/opportunities")
class OpportunityController(
    private val opportunityService: OpportunityService
) {
    @GetMapping
    fun getAllOpportunities(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @RequestParam(required = false) search: String?
    ): ResponseEntity<List<OpportunityEntity>> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val opportunities = if (search.isNullOrBlank()) {
                opportunityService.getAllOpportunities(tenantUUID)
            } else {
                opportunityService.searchOpportunities(tenantUUID, search)
            }
            ResponseEntity.ok(opportunities)
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @GetMapping("/{id}")
    fun getOpportunityById(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String
    ): ResponseEntity<OpportunityEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val opportunityUUID = validateUUID(id)
            opportunityService.getOpportunityById(tenantUUID, opportunityUUID)?.let { ResponseEntity.ok(it) }
                ?: ResponseEntity.notFound().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @PostMapping
    fun createOpportunity(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @RequestHeader("X-User-ID") userId: String,
        @Valid @RequestBody opportunity: OpportunityEntity
    ): ResponseEntity<OpportunityEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val userUUID = validateUUID(userId)
            val newOpportunity = opportunity.copy(
                id = UUID.randomUUID(),
                tenantId = tenantUUID,
                ownerId = userUUID
            )
            val savedOpportunity = opportunityService.createOpportunity(newOpportunity)
            ResponseEntity.status(HttpStatus.CREATED).body(savedOpportunity)
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @PutMapping("/{id}")
    fun updateOpportunity(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String,
        @Valid @RequestBody updates: OpportunityEntity
    ): ResponseEntity<OpportunityEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val opportunityUUID = validateUUID(id)
            opportunityService.updateOpportunity(tenantUUID, opportunityUUID, updates)?.let { ResponseEntity.ok(it) }
                ?: ResponseEntity.notFound().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @DeleteMapping("/{id}")
    fun deleteOpportunity(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String
    ): ResponseEntity<Void> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val opportunityUUID = validateUUID(id)
            if (opportunityService.deleteOpportunity(tenantUUID, opportunityUUID)) {
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