package com.backend.core.config

object TenantContext {
    private val currentTenant = ThreadLocal<String?>()
    private val userContext = ThreadLocal<String?>()

    fun setTenantId(tenantId: String?) {
        currentTenant.set(tenantId)
    }

    fun getTenantId(): String? {
        return currentTenant.get()
    }

    fun setUserId(userId: String?) {
        userContext.set(userId)
    }

    fun getUserId(): String? {
        return userContext.get()
    }

    fun clear() {
        currentTenant.remove()
        userContext.remove()
    }

    fun validateTenantAccess(resourceTenantId: String): Boolean {
        val currentTenantId = getTenantId()
        return currentTenantId != null && currentTenantId == resourceTenantId
    }
}