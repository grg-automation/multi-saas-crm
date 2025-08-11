package com.backend.core.tenant

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface TenantRepository : JpaRepository<TenantEntity, UUID> {
    fun findBySubdomain(subdomain: String): TenantEntity?

    fun findByName(name: String): TenantEntity?

    @Query("SELECT t FROM TenantEntity t WHERE t.isActive = true")
    fun findAllActive(): List<TenantEntity>

    @Query("SELECT t FROM TenantEntity t WHERE t.isTrial = true AND t.trialEndsAt < CURRENT_TIMESTAMP")
    fun findExpiredTrials(): List<TenantEntity>
}