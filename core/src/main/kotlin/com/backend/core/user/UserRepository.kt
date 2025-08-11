package com.backend.core.user

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface UserRepository : JpaRepository<UserEntity, UUID> {
    fun findByEmail(email: String): UserEntity?

    @Query("SELECT u FROM UserEntity u WHERE u.email = :email AND u.isActive = true")
    fun findActiveByEmail(@Param("email") email: String): UserEntity?

    @Query("SELECT u FROM UserEntity u WHERE " +
            "LOWER(u.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(u.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(u.displayName) LIKE LOWER(CONCAT('%', :search, '%'))")
    fun searchUsers(@Param("search") search: String): List<UserEntity>

    @Query("SELECT COUNT(u) FROM UserEntity u WHERE u.isActive = true AND u.tenantId = :tenantId")
    fun countByIsActiveAndTenantId(isActive: Boolean, @Param("tenantId") tenantId: UUID): Long

    fun existsByEmail(email: String): Boolean
}