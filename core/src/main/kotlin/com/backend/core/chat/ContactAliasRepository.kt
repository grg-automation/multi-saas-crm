package com.backend.core.chat

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface ContactAliasRepository : JpaRepository<ContactAliasEntity, UUID> {
    
    fun findByThreadId(threadId: String): ContactAliasEntity?
    
    @Query("SELECT COUNT(ca) FROM ContactAliasEntity ca")
    fun countAllAliases(): Long
    
    fun existsByThreadId(threadId: String): Boolean
}