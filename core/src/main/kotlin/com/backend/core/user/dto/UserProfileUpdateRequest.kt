package com.backend.core.user

data class UserProfileUpdateRequest(
    val firstName: String?,
    val lastName: String?,
    val displayName: String?,
    val phone: String?,
    val title: String?,
    val department: String?,
    val bio: String?,
    val timezone: String?,
    val locale: String?,
    val theme: String?
)