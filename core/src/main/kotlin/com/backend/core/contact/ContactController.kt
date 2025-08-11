package com.backend.core.contact

import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.*

@RestController
@RequestMapping("/contacts")
class ContactController(
    private val contactService: ContactService
) {
    @GetMapping
    fun getAllContacts(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @RequestParam(required = false) search: String?
    ): ResponseEntity<List<ContactEntity>> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val contacts = if (search.isNullOrBlank()) {
                contactService.getAllContacts(tenantUUID)
            } else {
                contactService.searchContacts(tenantUUID, search)
            }
            ResponseEntity.ok(contacts)
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @GetMapping("/{id}")
    fun getContactById(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String
    ): ResponseEntity<ContactEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val contactUUID = validateUUID(id)
            contactService.getContactById(tenantUUID, contactUUID)?.let { ResponseEntity.ok(it) }
                ?: ResponseEntity.notFound().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @PostMapping
    fun createContact(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @RequestHeader("X-User-ID") userId: String,
        @Valid @RequestBody contact: ContactEntity
    ): ResponseEntity<ContactEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val userUUID = validateUUID(userId)
            val newContact = contact.copy(
                id = UUID.randomUUID(),
                tenantId = tenantUUID,
                ownerId = userUUID
            )
            val savedContact = contactService.createContact(newContact)
            ResponseEntity.status(HttpStatus.CREATED).body(savedContact)
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @PutMapping("/{id}")
    fun updateContact(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String,
        @Valid @RequestBody updates: ContactEntity
    ): ResponseEntity<ContactEntity> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val contactUUID = validateUUID(id)
            contactService.updateContact(tenantUUID, contactId = contactUUID, updates = updates)?.let { ResponseEntity.ok(it) }
                ?: ResponseEntity.notFound().build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @DeleteMapping("/{id}")
    fun deleteContact(
        @RequestHeader("X-Tenant-ID") tenantId: String,
        @PathVariable id: String
    ): ResponseEntity<Void> {
        return try {
            val tenantUUID = validateUUID(tenantId)
            val contactUUID = validateUUID(id)
            if (contactService.deleteContact(tenantUUID, contactUUID)) {
                ResponseEntity.noContent().build()
            } else {
                ResponseEntity.notFound().build()
            }
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    private fun validateUUID(uuidStr: String): UUID {
        return try {
            UUID.fromString(uuidStr)
        } catch (e: IllegalArgumentException) {
            throw IllegalArgumentException("Invalid UUID format: $uuidStr")
        }
    }
}