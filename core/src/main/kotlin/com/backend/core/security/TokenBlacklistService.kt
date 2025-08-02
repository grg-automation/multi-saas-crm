package com.backend.core.security

import org.springframework.stereotype.Service
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

@Service
class TokenBlacklistService {
    
    // Temporary in-memory storage until Redis is properly configured
    private val blacklistedTokens = ConcurrentHashMap<String, Long>()

    fun blacklistToken(token: String, expiresInSeconds: Long) {
        val expirationTime = Instant.now().epochSecond + expiresInSeconds
        blacklistedTokens[token] = expirationTime
        
        // Clean up expired tokens periodically (simple cleanup)
        cleanupExpiredTokens()
    }

    fun isTokenBlacklisted(token: String): Boolean {
        val expirationTime = blacklistedTokens[token] ?: return false
        
        // Check if token has expired
        if (Instant.now().epochSecond > expirationTime) {
            blacklistedTokens.remove(token)
            return false
        }
        
        return true
    }
    
    private fun cleanupExpiredTokens() {
        val currentTime = Instant.now().epochSecond
        blacklistedTokens.entries.removeIf { it.value < currentTime }
    }
}
