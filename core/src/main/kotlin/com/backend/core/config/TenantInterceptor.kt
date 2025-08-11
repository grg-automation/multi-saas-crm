package com.backend.core.config

import com.backend.core.config.TenantContext
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import org.springframework.web.servlet.HandlerInterceptor
import java.util.*

@Component
class TenantInterceptor : HandlerInterceptor {

    override fun preHandle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        handler: Any
    ): Boolean {
        val tenantId = request.getHeader("X-Tenant-ID")

        if (tenantId.isNullOrBlank()) {
            response.status = HttpServletResponse.SC_BAD_REQUEST
            response.writer.write("""{"error": "X-Tenant-ID header is required"}""")
            return false
        }

        try {
            // Validate UUID format
            UUID.fromString(tenantId)
            TenantContext.setTenantId(tenantId)
            return true
        } catch (e: IllegalArgumentException) {
            response.status = HttpServletResponse.SC_BAD_REQUEST
            response.writer.write("""{"error": "Invalid tenant ID format"}""")
            return false
        }
    }

    override fun afterCompletion(
        request: HttpServletRequest,
        response: HttpServletResponse,
        handler: Any,
        ex: Exception?
    ) {
        TenantContext.clear()
    }
}