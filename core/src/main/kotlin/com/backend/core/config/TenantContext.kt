package com.backend.core.config

object TenantContext {
    private val currentTenant = ThreadLocal<String?>()

    fun setTenantId(tenantId: String?) {
        currentTenant.set(tenantId)
    }

    fun getTenantId(): String? {
        return currentTenant.get()
    }

    fun clear() {
        currentTenant.remove()
    }
}