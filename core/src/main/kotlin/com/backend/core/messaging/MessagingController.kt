package com.backend.core.messaging

import com.backend.core.user.UserEntity
import com.backend.core.user.UserRole
import com.backend.core.chat.ChatAssignmentService
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import jakarta.validation.Valid
import java.time.LocalDateTime
import java.util.*

@RestController
@RequestMapping("/api/v1/messaging")
@CrossOrigin(origins = ["http://localhost:3000", "http://localhost:3001"])
class MessagingController(
    private val messagingService: MessagingService,
    private val channelService: ChannelService,
    private val chatAssignmentService: ChatAssignmentService
) {

    // === INBOX & THREADS ===

    @GetMapping("/inbox")
    fun getInbox(
        @RequestParam tenantId: UUID,
        @RequestParam(required = false) managerId: UUID?,
        @RequestParam(required = false) channelId: UUID?,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "20") size: Int,
        @AuthenticationPrincipal user: UserEntity
    ): ResponseEntity<MessagingResponse<PagedResponse<ThreadDto>>> {
        return try {
            val pageable = PageRequest.of(page, size)
            
            // Фильтрация по ролям
            val threads = if (user.role == UserRole.ADMIN || user.isSuperuser) {
                // Админ видит все треды
                messagingService.getInboxThreads(tenantId, managerId, channelId, pageable)
            } else {
                // Менеджер видит только назначенные ему треды
                val assignedThreadIds = chatAssignmentService.getAssignedThreadIds(user.id!!)
                messagingService.getInboxThreadsForManager(tenantId, assignedThreadIds, channelId, pageable)
            }
            
            // Конвертируем в DTO с учетом роли
            val threadDtos = threads.map { convertToThreadDto(it, user.role) }
            
            val response = MessagingResponse(
                success = true,
                data = createPagedResponse(threadDtos)
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<PagedResponse<ThreadDto>>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @GetMapping("/threads/{threadId}")
    fun getThread(@PathVariable threadId: UUID): ResponseEntity<MessagingResponse<ThreadDto>> {
        return try {
            val thread = messagingService.getThreadById(threadId)
                ?: return ResponseEntity.notFound().build()
            
            val response = MessagingResponse(
                success = true,
                data = convertToThreadDto(thread)
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<ThreadDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @GetMapping("/threads/{threadId}/messages")
    fun getThreadMessages(
        @PathVariable threadId: UUID,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int
    ): ResponseEntity<MessagingResponse<PagedResponse<MessageDto>>> {
        return try {
            val pageable = PageRequest.of(page, size)
            val messages = messagingService.getThreadMessages(threadId, pageable)
            val messageDtos = messages.map { convertToMessageDto(it) }
            
            val response = MessagingResponse(
                success = true,
                data = createPagedResponse(messageDtos)
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<PagedResponse<MessageDto>>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @PutMapping("/threads/{threadId}/assign")
    fun assignThread(
        @PathVariable threadId: UUID,
        @RequestParam managerId: UUID
    ): ResponseEntity<MessagingResponse<ThreadDto>> {
        return try {
            val thread = messagingService.assignThread(threadId, managerId)
            val response = MessagingResponse(
                success = true,
                data = convertToThreadDto(thread)
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<ThreadDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @PutMapping("/threads/{threadId}/status")
    fun updateThreadStatus(
        @PathVariable threadId: UUID,
        @RequestParam status: ThreadStatus
    ): ResponseEntity<MessagingResponse<ThreadDto>> {
        return try {
            val thread = messagingService.updateThreadStatus(threadId, status)
            val response = MessagingResponse(
                success = true,
                data = convertToThreadDto(thread)
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<ThreadDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @PutMapping("/threads/{threadId}/read")
    fun markThreadAsRead(@PathVariable threadId: UUID): ResponseEntity<MessagingResponse<ThreadDto>> {
        return try {
            val thread = messagingService.markThreadAsRead(threadId)
            val response = MessagingResponse(
                success = true,
                data = convertToThreadDto(thread)
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<ThreadDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    // === MESSAGES ===

    @PostMapping("/messages/inbound")
    fun createInboundMessage(
        @RequestParam tenantId: UUID,
        @Valid @RequestBody request: InboundMessageRequest
    ): ResponseEntity<MessagingResponse<MessageDto>> {
        return try {
            val message = messagingService.createInboundMessage(
                tenantId = tenantId,
                channelId = request.channelId,
                externalId = request.externalId,
                content = request.content,
                senderExternalId = request.senderExternalId,
                senderName = request.senderName,
                messageType = request.messageType,
                sentAt = request.sentAt ?: LocalDateTime.now(),
                attachments = request.attachments,
                metadata = request.metadata
            )
            
            val response = MessagingResponse(
                success = true,
                data = convertToMessageDto(message)
            )
            ResponseEntity.status(HttpStatus.CREATED).body(response)
        } catch (e: Exception) {
            val response = MessagingResponse<MessageDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @PostMapping("/messages/outbound")
    fun createOutboundMessage(
        @RequestParam tenantId: UUID,
        @Valid @RequestBody request: OutboundMessageRequest
    ): ResponseEntity<MessagingResponse<MessageDto>> {
        return try {
            val message = messagingService.createOutboundMessage(
                tenantId = tenantId,
                threadId = request.threadId,
                content = request.content,
                senderId = request.senderId,
                senderName = request.senderName,
                messageType = request.messageType,
                attachments = request.attachments,
                replyToMessageId = request.replyToMessageId,
                metadata = request.metadata
            )
            
            val response = MessagingResponse(
                success = true,
                data = convertToMessageDto(message)
            )
            ResponseEntity.status(HttpStatus.CREATED).body(response)
        } catch (e: Exception) {
            val response = MessagingResponse<MessageDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @PutMapping("/messages/{messageId}/status")
    fun updateMessageStatus(
        @PathVariable messageId: UUID,
        @Valid @RequestBody request: UpdateMessageStatusRequest
    ): ResponseEntity<MessagingResponse<MessageDto>> {
        return try {
            val message = messagingService.updateMessageStatus(
                messageId = messageId,
                status = request.status,
                errorMessage = request.errorMessage
            )
            
            val response = MessagingResponse(
                success = true,
                data = convertToMessageDto(message)
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<MessageDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @PutMapping("/messages/{messageId}/sentiment")
    fun updateMessageSentiment(
        @PathVariable messageId: UUID,
        @Valid @RequestBody request: UpdateSentimentRequest
    ): ResponseEntity<MessagingResponse<String>> {
        return try {
            messagingService.updateMessageSentiment(
                messageId = messageId,
                sentimentScore = request.sentimentScore,
                sentimentLabel = request.sentimentLabel,
                isSpam = request.isSpam,
                confidenceScore = request.confidenceScore
            )
            
            val response = MessagingResponse(
                success = true,
                data = "Sentiment updated successfully"
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<String>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    // === CHANNELS ===

    @GetMapping("/channels")
    fun getChannels(
        @RequestParam tenantId: UUID,
        @RequestParam(required = false) managerId: UUID?,
        @RequestParam(required = false) type: ChannelType?,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "20") size: Int
    ): ResponseEntity<MessagingResponse<PagedResponse<ChannelDto>>> {
        return try {
            val pageable = PageRequest.of(page, size, Sort.by("createdAt").descending())
            
            val channels = when {
                managerId != null -> channelService.findByManager(tenantId, managerId)
                type != null -> channelService.findByType(tenantId, type)
                else -> channelService.findByTenant(tenantId)
            }
            
            // Convert to page-like structure for consistency
            val channelDtos = channels.map { convertToChannelDto(it) }
            val pagedChannels = createSimplePagedResponse(channelDtos, page, size)
            
            val response = MessagingResponse(
                success = true,
                data = pagedChannels
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<PagedResponse<ChannelDto>>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    @PostMapping("/channels")
    fun createChannel(
        @RequestParam tenantId: UUID,
        @Valid @RequestBody request: CreateChannelRequest
    ): ResponseEntity<MessagingResponse<ChannelDto>> {
        return try {
            val channel = channelService.createChannel(
                tenantId = tenantId,
                type = request.type,
                externalId = request.externalId,
                managerId = request.managerId,
                displayName = request.displayName,
                metadata = request.metadata
            )
            
            val response = MessagingResponse(
                success = true,
                data = convertToChannelDto(channel)
            )
            ResponseEntity.status(HttpStatus.CREATED).body(response)
        } catch (e: Exception) {
            val response = MessagingResponse<ChannelDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    // === STATISTICS ===

    @GetMapping("/stats")
    fun getMessagingStats(
        @RequestParam tenantId: UUID,
        @RequestParam(required = false) managerId: UUID?,
        @RequestParam(defaultValue = "7") daysPeriod: Int
    ): ResponseEntity<MessagingResponse<MessagingStatsDto>> {
        return try {
            val fromDate = LocalDateTime.now().minusDays(daysPeriod.toLong())
            
            val threadStats = messagingService.getThreadStatistics(tenantId)
            val messageStats = messagingService.getMessageStatistics(tenantId, fromDate)
            val channelStats = channelService.getChannelStatsByTenant(tenantId)
            val unreadCounts = messagingService.getUnreadCounts(tenantId, managerId)
            
            val stats = MessagingStatsDto(
                threadStats = ThreadStatsDto(
                    total = (threadStats["byStatus"] as Map<String, Long>).values.sum(),
                    byStatus = threadStats["byStatus"] as Map<String, Long>,
                    unreadThreads = threadStats["unreadThreads"] as Long,
                    averageResponseTimeMinutes = null // Could be calculated
                ),
                messageStats = MessageStatsDto(
                    total = messageStats["total"] as Long,
                    byDirection = messageStats["byDirection"] as Map<String, Long>,
                    outboundByStatus = messageStats["outboundByStatus"] as Map<String, Long>,
                    todayCount = 0L, // Could be calculated
                    weekCount = messageStats["total"] as Long
                ),
                channelStats = ChannelStatsDto(
                    total = channelStats["total"] as Int,
                    byType = channelStats["byType"] as Map<String, Long>,
                    byStatus = channelStats["byStatus"] as Map<String, Long>,
                    needingAttention = 0 // Could be calculated
                ),
                unreadCounts = UnreadCountsDto(
                    total = unreadCounts["total"] ?: 0L,
                    manager = unreadCounts["manager"] ?: 0L
                )
            )
            
            val response = MessagingResponse(
                success = true,
                data = stats
            )
            ResponseEntity.ok(response)
        } catch (e: Exception) {
            val response = MessagingResponse<MessagingStatsDto>(
                success = false,
                error = e.message
            )
            ResponseEntity.badRequest().body(response)
        }
    }

    // === HELPER METHODS ===

    private fun convertToThreadDto(thread: ThreadEntity): ThreadDto {
        return convertToThreadDto(thread, UserRole.ADMIN) // Default to admin for backward compatibility
    }

    private fun convertToThreadDto(thread: ThreadEntity, userRole: UserRole): ThreadDto {
        return ThreadDto(
            id = thread.id,
            tenantId = thread.tenantId,
            channelId = thread.channelId,
            contactId = thread.contactId,
            status = thread.status,
            assignedTo = thread.assignedTo,
            priority = thread.priority,
            subject = thread.subject,
            messageCount = thread.messageCount,
            unreadCount = thread.unreadCount,
            lastMessageAt = thread.lastMessageAt,
            lastCustomerMessageAt = thread.lastCustomerMessageAt,
            lastAgentMessageAt = thread.lastAgentMessageAt,
            firstResponseAt = thread.firstResponseAt,
            resolvedAt = thread.resolvedAt,
            createdAt = thread.createdAt,
            updatedAt = thread.updatedAt,
            channel = thread.channel?.let { convertToChannelDto(it) },
            contact = thread.contact?.let { 
                if (userRole == UserRole.MANAGER) {
                    // Для менеджеров показываем анонимизированные данные
                    convertToAnonymizedContactDto(thread.id.toString())
                } else {
                    // Для админов показываем полные данные
                    convertToContactSummaryDto(it)
                }
            },
            lastMessage = null // Could be populated if needed
        )
    }

    private fun convertToAnonymizedContactDto(threadId: String): ContactSummaryDto {
        val alias = chatAssignmentService.getContactAlias(threadId)
        return ContactSummaryDto(
            id = UUID.randomUUID(), // Фиктивный ID
            firstName = alias,
            lastName = "",
            fullName = alias,
            email = null, // Скрываем
            phone = null, // Скрываем
            username = null // Скрываем
        )
    }

    private fun convertToMessageDto(message: MessageEntity): MessageDto {
        return MessageDto(
            id = message.id,
            tenantId = message.tenantId,
            threadId = message.threadId,
            direction = message.direction,
            externalId = message.externalId,
            messageType = message.messageType,
            content = message.content,
            contentHtml = message.contentHtml,
            attachments = null, // Parse from JSON if needed
            status = message.status,
            senderId = message.senderId,
            senderName = message.senderName,
            senderExternalId = message.senderExternalId,
            replyToMessageId = message.replyToMessageId,
            sentAt = message.sentAt,
            deliveredAt = message.deliveredAt,
            readAt = message.readAt,
            failedAt = message.failedAt,
            errorMessage = message.errorMessage,
            sentimentScore = message.sentimentScore,
            sentimentLabel = message.sentimentLabel,
            isSpam = message.isSpam,
            createdAt = message.createdAt,
            updatedAt = message.updatedAt,
            isInbound = message.isInbound,
            isOutbound = message.isOutbound,
            isDelivered = message.isDelivered,
            isRead = message.isRead,
            isFailed = message.isFailed,
            hasAttachments = message.hasAttachments
        )
    }

    private fun convertToChannelDto(channel: ChannelEntity): ChannelDto {
        return ChannelDto(
            id = channel.id,
            tenantId = channel.tenantId,
            type = channel.type,
            externalId = channel.externalId,
            managerId = channel.managerId,
            status = channel.status,
            displayName = channel.displayName,
            isActive = channel.isActive,
            lastActivityAt = channel.lastActivityAt,
            createdAt = channel.createdAt,
            updatedAt = channel.updatedAt
        )
    }

    private fun convertToContactSummaryDto(contact: com.backend.core.contact.ContactEntity): ContactSummaryDto {
        return ContactSummaryDto(
            id = contact.id,
            firstName = contact.firstName,
            lastName = contact.lastName,
            email = contact.email,
            phone = contact.phone,
            fullName = contact.fullName
        )
    }

    private fun <T> createPagedResponse(page: Page<T>): PagedResponse<T> {
        return PagedResponse(
            content = page.content,
            totalElements = page.totalElements,
            totalPages = page.totalPages,
            number = page.number,
            size = page.size,
            hasNext = page.hasNext(),
            hasPrevious = page.hasPrevious()
        )
    }

    private fun <T> createSimplePagedResponse(items: List<T>, page: Int, size: Int): PagedResponse<T> {
        val totalElements = items.size.toLong()
        val totalPages = (totalElements + size - 1) / size
        val start = page * size
        val end = minOf(start + size, items.size)
        val content = if (start < items.size) items.subList(start, end) else emptyList()

        return PagedResponse(
            content = content,
            totalElements = totalElements,
            totalPages = totalPages.toInt(),
            number = page,
            size = size,
            hasNext = page < totalPages - 1,
            hasPrevious = page > 0
        )
    }
}