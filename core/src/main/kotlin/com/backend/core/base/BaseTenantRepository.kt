package com.backend.core.base

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.repository.NoRepositoryBean
import java.util.*

@NoRepositoryBean
interface BaseTenantRepository<T, ID> : JpaRepository<T, ID> {
    fun findByTenantId(tenantId: UUID): List<T>
    fun findByTenantIdAndId(tenantId: UUID, id: ID): T?
    fun deleteByTenantIdAndId(tenantId: UUID, id: ID): Long
    fun existsByTenantIdAndId(tenantId: UUID, id: ID): Boolean
}