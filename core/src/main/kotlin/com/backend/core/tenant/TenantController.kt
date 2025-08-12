package com.backend.core.tenant

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.*

@RestController
@RequestMapping("/api/v1/tenant")
class TenantController(
    private val tenantService: TenantService
) {

    // REQUIRED: Internal endpoint for API Gateway to validate tenants
    @GetMapping("/{tenantId}")
    fun getTenantById(
        @PathVariable tenantId: String,
        @RequestHeader("x-service-auth", required = false) serviceAuth: String?
    ): ResponseEntity<TenantResponse> {

        // Validate internal service authentication
        if (serviceAuth != "gateway-internal") {
            return ResponseEntity.status(403).build()
        }

        return try {
            val tenantUUID = UUID.fromString(tenantId)
            tenantService.getTenantById(tenantUUID)?.let { tenant ->
                ResponseEntity.ok(TenantResponse(
                    id = tenant.id.toString(),
                    name = tenant.name,
                    displayName = tenant.displayName,
                    status = if (tenant.isActive) "active" else "inactive",
                    subscriptionPlan = tenant.subscriptionPlan.name.lowercase(),
                    isTrial = tenant.isTrial ?: true,
                    trialEndsAt = tenant.trialEndsAt,
                    maxUsers = tenant.maxUsers,
                    maxCompanies = tenant.maxCompanies,
                    maxContacts = tenant.maxContacts,
                    maxOpportunities = tenant.maxOpportunities,
                    maxTasks = tenant.maxTasks
                ))
            } ?: ResponseEntity.notFound().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    // REQUIRED: Tenant usage endpoint for limit checking
    @GetMapping("/{tenantId}/usage")
    fun getTenantUsage(
        @PathVariable tenantId: String,
        @RequestHeader("x-service-auth", required = false) serviceAuth: String?,
        @RequestHeader("X-Tenant-ID") requestTenantId: String
    ): ResponseEntity<TenantUsageResponse> {
        // Validate internal service authentication OR same tenant
        if (serviceAuth != "gateway-internal" && tenantId != requestTenantId) {
            return ResponseEntity.status(403).build()
        }
        return try {
            val tenantUUID = UUID.fromString(tenantId)
            val usage = tenantService.getTenantUsage(tenantUUID)
            ResponseEntity.ok(TenantUsageResponse(
                tenantId = tenantId,
                activeUsers = usage.activeUserCount,
                companies = tenantService.getCompanyCount(tenantUUID),
                contacts = tenantService.getContactCount(tenantUUID),
                opportunities = tenantService.getOpportunityCount(tenantUUID),
                tasks = usage.activeTaskCount
            ))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    // Get current tenant info (for authenticated users)
    @GetMapping("/current")
    fun getCurrentTenant(
        @RequestHeader("X-Tenant-ID") tenantId: String
    ): ResponseEntity<TenantInfoResponse> {
        return try {
            val tenantUUID = UUID.fromString(tenantId)
            tenantService.getTenantById(tenantUUID)?.let { tenant ->
                val usage = tenantService.getTenantUsage(tenantUUID)
                ResponseEntity.ok(TenantInfoResponse(
                    tenant = TenantResponse(
                        id = tenant.id.toString(),
                        name = tenant.name,
                        displayName = tenant.displayName,
                        status = if (tenant.isActive) "active" else "inactive",
                        subscriptionPlan = tenant.subscriptionPlan.name.lowercase(),
                        isTrial = tenant.isTrial ?: true,
                        trialEndsAt = tenant.trialEndsAt,
                        maxUsers = tenant.maxUsers,
                        maxCompanies = tenant.maxCompanies,
                        maxContacts = tenant.maxContacts,
                        maxOpportunities = tenant.maxOpportunities,
                        maxTasks = tenant.maxTasks
                    ),
                    usage = TenantUsageResponse(
                        tenantId = tenantId,
                        activeUsers = usage.activeUserCount,
                        companies = tenantService.getCompanyCount(tenantUUID),
                        contacts = tenantService.getContactCount(tenantUUID),
                        opportunities = tenantService.getOpportunityCount(tenantUUID),
                        tasks = usage.activeTaskCount
                    )
                ))
            } ?: ResponseEntity.notFound().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }
}

// Data classes for responses
data class TenantResponse(
    val id: String,
    val name: String,
    val displayName: String,
    val status: String,
    val subscriptionPlan: String,
    val isTrial: Boolean?,
    val trialEndsAt: java.time.LocalDateTime?,
    val maxUsers: Int,
    val maxCompanies: Int,
    val maxContacts: Int,
    val maxOpportunities: Int,
    val maxTasks: Int
)

data class TenantUsageResponse(
    val tenantId: String,
    val activeUsers: Int,
    val companies: Long,
    val contacts: Long,
    val opportunities: Long,
    val tasks: Int
)

data class TenantInfoResponse(
    val tenant: TenantResponse,
    val usage: TenantUsageResponse
)