package com.backend.core.user

data class UserSettingsUpdateRequest(
    val timezone: String?,
    val locale: String?,
    val theme: String?,
    val emailNotifications: Boolean?,
    val smsNotifications: Boolean?,
    val pushNotifications: Boolean?,
    val marketingNotifications: Boolean?
)