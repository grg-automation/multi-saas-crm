package com.backend.core.user

data class CreateUserProfileRequest(
    val email: String,
    val displayName: String?,
    val firstName: String?,
    val lastName: String?,
    val phone: String?,
    val title: String?,
    val department: String?,
    val bio: String?,
    val timezone: String?,
    val locale: String?,
    val theme: String?,
    val role: UserRole?
)