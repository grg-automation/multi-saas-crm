package com.backend.core.opportunity

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.util.*

@Repository
interface OpportunityRepository : JpaRepository<OpportunityEntity, UUID> {
    fun findByTenantId(tenantId: UUID): List<OpportunityEntity>

    fun findByTenantIdAndCompanyId(tenantId: UUID, companyId: UUID): List<OpportunityEntity>

    fun findByTenantIdAndContactId(tenantId: UUID, contactId: UUID): List<OpportunityEntity>

    @Query("SELECT o FROM OpportunityEntity o WHERE o.tenantId = :tenantId AND o.id = :id")
    fun findByTenantIdAndId(@Param("tenantId") tenantId: UUID, @Param("id") id: UUID): OpportunityEntity?

    @Query("SELECT o FROM OpportunityEntity o WHERE o.tenantId = :tenantId AND " +
            "(LOWER(o.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(o.description) LIKE LOWER(CONCAT('%', :search, '%')))")
    fun searchByTenantId(@Param("tenantId") tenantId: UUID, @Param("search") search: String): List<OpportunityEntity>

    fun countByTenantId(tenantId: UUID): Long

    @Query("SELECT o FROM OpportunityEntity o WHERE o.tenantId = :tenantId AND o.isActive = true")
    fun findActiveByTenantId(@Param("tenantId") tenantId: UUID): List<OpportunityEntity>

    @Query("SELECT o FROM OpportunityEntity o WHERE o.tenantId = :tenantId AND o.isClosed = false ORDER BY o.closeDate ASC")
    fun findOpenOpportunitiesByTenantId(@Param("tenantId") tenantId: UUID): List<OpportunityEntity>
}