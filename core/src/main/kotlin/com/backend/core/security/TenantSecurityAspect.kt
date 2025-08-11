package com.backend.core.security

import com.backend.core.config.TenantContext
import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.springframework.stereotype.Component
import java.util.*

@Aspect
@Component
class TenantSecurityAspect {

    @Around("@annotation(tenantSecured)")
    fun validateTenantAccess(joinPoint: ProceedingJoinPoint, tenantSecured: TenantSecured): Any? {
        val args = joinPoint.args
        val tenantId = args.firstOrNull { it is UUID } as? UUID
            ?: throw SecurityException("Tenant ID not found in method arguments")

        val currentTenantId = TenantContext.getTenantId()?.let { UUID.fromString(it) }
            ?: throw SecurityException("No tenant context available")

        if (tenantId != currentTenantId) {
            throw SecurityException("Access denied: Tenant mismatch")
        }

        return joinPoint.proceed()
    }
}

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class TenantSecured