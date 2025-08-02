package com.backend.core.chat

import com.backend.core.user.UserEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface ChatAssignmentRepository : JpaRepository<ChatAssignmentEntity, UUID> {
    
    fun findByThreadIdAndIsActive(threadId: String, isActive: Boolean): List<ChatAssignmentEntity>
    
    fun findByManagerAndIsActive(manager: UserEntity, isActive: Boolean): List<ChatAssignmentEntity>
    
    @Query("SELECT ca FROM ChatAssignmentEntity ca WHERE ca.manager.id = :managerId AND ca.isActive = true")
    fun findActiveAssignmentsByManagerId(@Param("managerId") managerId: UUID): List<ChatAssignmentEntity>
    
    @Query("SELECT ca FROM ChatAssignmentEntity ca WHERE ca.threadId = :threadId AND ca.isActive = true")
    fun findActiveAssignmentsByThreadId(@Param("threadId") threadId: String): List<ChatAssignmentEntity>
    
    fun existsByThreadIdAndManagerAndIsActive(threadId: String, manager: UserEntity, isActive: Boolean): Boolean
}