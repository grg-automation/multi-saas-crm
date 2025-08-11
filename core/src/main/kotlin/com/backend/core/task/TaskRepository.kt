package com.backend.core.task

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface TaskRepository : JpaRepository<Task, UUID> {
    @Query("SELECT t FROM Task t WHERE t.tenantId = :tenantId")
    fun findByTenantId(@Param("tenantId") tenantId: UUID): List<Task>

    @Query("SELECT t FROM Task t WHERE t.tenantId = :tenantId AND t.status = :status")
    fun findByTenantIdAndStatus(@Param("tenantId") tenantId: UUID, @Param("status") status: Task.TaskStatus): List<Task>
}