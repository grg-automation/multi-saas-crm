package com.backend.core.messaging

import com.backend.core.contact.ContactEntity
import com.backend.core.contact.ContactRepository
import com.backend.core.contact.ContactType
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mock
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.*
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import java.time.LocalDateTime
import java.util.*
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests for MessagingService
 * Тестирование основных операций messaging системы
 */
class MessagingServiceTest {

    @Mock
    private lateinit var channelRepository: ChannelRepository

    @Mock
    private lateinit var threadRepository: ThreadRepository

    @Mock
    private lateinit var messageRepository: MessageRepository

    @Mock
    private lateinit var contactRepository: ContactRepository

    private lateinit var messagingService: MessagingService

    private val testTenantId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val testManagerId = UUID.fromString("00000000-0000-0000-0000-000000000002")
    private val testContactId = UUID.fromString("00000000-0000-0000-0000-000000000003")
    private val testChannelId = UUID.fromString("00000000-0000-0000-0000-000000000004")
    private val testThreadId = UUID.fromString("00000000-0000-0000-0000-000000000005")

    @BeforeEach
    fun setUp() {
        MockitoAnnotations.openMocks(this)
        messagingService = MessagingService(
            channelRepository,
            threadRepository,
            messageRepository,
            contactRepository
        )
    }

    // ===========================
    // CHANNEL TESTS
    // ===========================

    @Test
    fun `should create telegram channel successfully`() {
        // Given
        val createChannelDto = CreateChannelDto(
            type = ChannelType.TELEGRAM,
            externalId = "@testuser",
            managerId = testManagerId,
            tenantId = testTenantId
        )

        val savedChannel = ChannelEntity(
            id = testChannelId,
            type = ChannelType.TELEGRAM,
            externalId = "@testuser",
            managerId = testManagerId,
            tenantId = testTenantId,
            status = ChannelStatus.ACTIVE,
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        whenever(channelRepository.findByExternalIdAndTenantId("@testuser", testTenantId))
            .thenReturn(null)
        whenever(channelRepository.save(any<ChannelEntity>()))
            .thenReturn(savedChannel)

        // When
        val result = messagingService.createChannel(createChannelDto)

        // Then
        assertNotNull(result)
        assertEquals(ChannelType.TELEGRAM, result.type)
        assertEquals("@testuser", result.externalId)
        assertEquals(testManagerId, result.managerId)
        assertEquals(ChannelStatus.ACTIVE, result.status)

        verify(channelRepository).findByExternalIdAndTenantId("@testuser", testTenantId)
        verify(channelRepository).save(any<ChannelEntity>())
    }

    @Test
    fun `should throw exception when creating duplicate channel`() {
        // Given
        val createChannelDto = CreateChannelDto(
            type = ChannelType.TELEGRAM,
            externalId = "@testuser",
            managerId = testManagerId,
            tenantId = testTenantId
        )

        val existingChannel = ChannelEntity(
            id = testChannelId,
            type = ChannelType.TELEGRAM,
            externalId = "@testuser",
            managerId = testManagerId,
            tenantId = testTenantId,
            status = ChannelStatus.ACTIVE,
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        whenever(channelRepository.findByExternalIdAndTenantId("@testuser", testTenantId))
            .thenReturn(existingChannel)

        // When & Then
        val exception = assertThrows<IllegalArgumentException> {
            messagingService.createChannel(createChannelDto)
        }

        assertEquals("Channel with external ID @testuser already exists", exception.message)
        verify(channelRepository).findByExternalIdAndTenantId("@testuser", testTenantId)
        verify(channelRepository, never()).save(any<ChannelEntity>())
    }

    @Test
    fun `should get channels by manager successfully`() {
        // Given
        val pageable = PageRequest.of(0, 10, Sort.by("createdAt").descending())
        val channels = listOf(
            ChannelEntity(
                id = testChannelId,
                type = ChannelType.TELEGRAM,
                externalId = "@testuser",
                managerId = testManagerId,
                tenantId = testTenantId,
                status = ChannelStatus.ACTIVE,
                createdAt = LocalDateTime.now(),
                updatedAt = LocalDateTime.now()
            )
        )
        val page = PageImpl(channels, pageable, 1)

        whenever(channelRepository.findByManagerIdAndTenantId(testManagerId, testTenantId, pageable))
            .thenReturn(page)

        // When
        val result = messagingService.getChannelsByManager(testManagerId, testTenantId, pageable)

        // Then
        assertNotNull(result)
        assertEquals(1, result.content.size)
        assertEquals(ChannelType.TELEGRAM, result.content[0].type)
        assertEquals("@testuser", result.content[0].externalId)

        verify(channelRepository).findByManagerIdAndTenantId(testManagerId, testTenantId, pageable)
    }

    // ===========================
    // MESSAGE TESTS
    // ===========================

    @Test
    fun `should process inbound message successfully`() {
        // Given
        val inboundDto = InboundMessageDto(
            channelType = ChannelType.TELEGRAM,
            externalId = "msg_123",
            from = "@testuser",
            content = "Hello from Telegram",
            tenantId = testTenantId
        )

        val channel = ChannelEntity(
            id = testChannelId,
            type = ChannelType.TELEGRAM,
            externalId = "@testuser",
            managerId = testManagerId,
            tenantId = testTenantId,
            status = ChannelStatus.ACTIVE,
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        val contact = ContactEntity(
            id = testContactId,
            firstName = "Test",
            lastName = "User",
            email = "test@example.com",
            phone = "+79001234567",
            type = ContactType.LEAD,
            tenantId = testTenantId,
            companyId = null,
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        val thread = ThreadEntity(
            id = testThreadId,
            channelId = testChannelId,
            contactId = testContactId,
            tenantId = testTenantId,
            status = ThreadStatus.ACTIVE,
            assignedTo = testManagerId,
            lastMessageAt = LocalDateTime.now(),
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        val savedMessage = MessageEntity(
            id = UUID.randomUUID(),
            threadId = testThreadId,
            direction = MessageDirection.INBOUND,
            externalId = "msg_123",
            content = "Hello from Telegram",
            status = MessageStatus.RECEIVED,
            tenantId = testTenantId,
            sentAt = LocalDateTime.now(),
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        whenever(channelRepository.findByExternalIdAndTenantId("@testuser", testTenantId))
            .thenReturn(channel)
        whenever(contactRepository.findByEmailAndTenantId(any(), eq(testTenantId)))
            .thenReturn(contact)
        whenever(threadRepository.findByChannelIdAndContactId(testChannelId, testContactId))
            .thenReturn(thread)
        whenever(messageRepository.save(any<MessageEntity>()))
            .thenReturn(savedMessage)

        // When
        val result = messagingService.processInboundMessage(inboundDto)

        // Then
        assertNotNull(result)
        assertEquals(MessageDirection.INBOUND, result.direction)
        assertEquals("msg_123", result.externalId)
        assertEquals("Hello from Telegram", result.content)
        assertEquals(MessageStatus.RECEIVED, result.status)

        verify(channelRepository).findByExternalIdAndTenantId("@testuser", testTenantId)
        verify(messageRepository).save(any<MessageEntity>())
    }

    @Test
    fun `should send outbound message successfully`() {
        // Given
        val outboundDto = OutboundMessageDto(
            threadId = testThreadId,
            content = "Hello from CRM",
            tenantId = testTenantId
        )

        val thread = ThreadEntity(
            id = testThreadId,
            channelId = testChannelId,
            contactId = testContactId,
            tenantId = testTenantId,
            status = ThreadStatus.ACTIVE,
            assignedTo = testManagerId,
            lastMessageAt = LocalDateTime.now(),
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        val savedMessage = MessageEntity(
            id = UUID.randomUUID(),
            threadId = testThreadId,
            direction = MessageDirection.OUTBOUND,
            externalId = "out_msg_123",
            content = "Hello from CRM",
            status = MessageStatus.PENDING,
            tenantId = testTenantId,
            sentAt = LocalDateTime.now(),
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        whenever(threadRepository.findByIdAndTenantId(testThreadId, testTenantId))
            .thenReturn(thread)
        whenever(messageRepository.save(any<MessageEntity>()))
            .thenReturn(savedMessage)

        // When
        val result = messagingService.sendOutboundMessage(outboundDto)

        // Then
        assertNotNull(result)
        assertEquals(MessageDirection.OUTBOUND, result.direction)
        assertEquals("Hello from CRM", result.content)
        assertEquals(MessageStatus.PENDING, result.status)

        verify(threadRepository).findByIdAndTenantId(testThreadId, testTenantId)
        verify(messageRepository).save(any<MessageEntity>())
    }

    @Test
    fun `should throw exception when thread not found for outbound message`() {
        // Given
        val outboundDto = OutboundMessageDto(
            threadId = testThreadId,
            content = "Hello from CRM",
            tenantId = testTenantId
        )

        whenever(threadRepository.findByIdAndTenantId(testThreadId, testTenantId))
            .thenReturn(null)

        // When & Then
        val exception = assertThrows<IllegalArgumentException> {
            messagingService.sendOutboundMessage(outboundDto)
        }

        assertTrue(exception.message!!.contains("Thread not found"))
        verify(threadRepository).findByIdAndTenantId(testThreadId, testTenantId)
        verify(messageRepository, never()).save(any<MessageEntity>())
    }

    // ===========================
    // THREAD TESTS
    // ===========================

    @Test
    fun `should get threads by manager successfully`() {
        // Given
        val pageable = PageRequest.of(0, 10, Sort.by("lastMessageAt").descending())
        val threads = listOf(
            ThreadEntity(
                id = testThreadId,
                channelId = testChannelId,
                contactId = testContactId,
                tenantId = testTenantId,
                status = ThreadStatus.ACTIVE,
                assignedTo = testManagerId,
                lastMessageAt = LocalDateTime.now(),
                createdAt = LocalDateTime.now(),
                updatedAt = LocalDateTime.now()
            )
        )
        val page = PageImpl(threads, pageable, 1)

        whenever(threadRepository.findByAssignedToAndTenantId(testManagerId, testTenantId, pageable))
            .thenReturn(page)

        // When
        val result = messagingService.getThreadsByManager(testManagerId, testTenantId, pageable)

        // Then
        assertNotNull(result)
        assertEquals(1, result.content.size)
        assertEquals(ThreadStatus.ACTIVE, result.content[0].status)
        assertEquals(testManagerId, result.content[0].assignedTo)

        verify(threadRepository).findByAssignedToAndTenantId(testManagerId, testTenantId, pageable)
    }

    @Test
    fun `should get messages by thread successfully`() {
        // Given
        val pageable = PageRequest.of(0, 50, Sort.by("sentAt").ascending())
        val messages = listOf(
            MessageEntity(
                id = UUID.randomUUID(),
                threadId = testThreadId,
                direction = MessageDirection.INBOUND,
                externalId = "msg_1",
                content = "Hello",
                status = MessageStatus.RECEIVED,
                tenantId = testTenantId,
                sentAt = LocalDateTime.now().minusMinutes(5),
                createdAt = LocalDateTime.now(),
                updatedAt = LocalDateTime.now()
            ),
            MessageEntity(
                id = UUID.randomUUID(),
                threadId = testThreadId,
                direction = MessageDirection.OUTBOUND,
                externalId = "msg_2",
                content = "Hi there!",
                status = MessageStatus.SENT,
                tenantId = testTenantId,
                sentAt = LocalDateTime.now(),
                createdAt = LocalDateTime.now(),
                updatedAt = LocalDateTime.now()
            )
        )
        val page = PageImpl(messages, pageable, 2)

        whenever(messageRepository.findByThreadIdAndTenantId(testThreadId, testTenantId, pageable))
            .thenReturn(page)

        // When
        val result = messagingService.getMessagesByThread(testThreadId, testTenantId, pageable)

        // Then
        assertNotNull(result)
        assertEquals(2, result.content.size)
        assertEquals(MessageDirection.INBOUND, result.content[0].direction)
        assertEquals(MessageDirection.OUTBOUND, result.content[1].direction)

        verify(messageRepository).findByThreadIdAndTenantId(testThreadId, testTenantId, pageable)
    }

    // ===========================
    // INTEGRATION TESTS
    // ===========================

    @Test
    fun `should find or create contact for new telegram user`() {
        // Given
        val from = "@newuser"
        val firstName = "New"
        val lastName = "User"

        whenever(contactRepository.findByEmailAndTenantId(any(), eq(testTenantId)))
            .thenReturn(null)

        val savedContact = ContactEntity(
            id = testContactId,
            firstName = firstName,
            lastName = lastName,
            email = "newuser@telegram.local",
            phone = null,
            type = ContactType.LEAD,
            tenantId = testTenantId,
            companyId = null,
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        whenever(contactRepository.save(any<ContactEntity>()))
            .thenReturn(savedContact)

        // When
        val result = messagingService.findOrCreateContact(from, firstName, lastName, testTenantId)

        // Then
        assertNotNull(result)
        assertEquals(firstName, result.firstName)
        assertEquals(lastName, result.lastName)
        assertEquals("newuser@telegram.local", result.email)
        assertEquals(ContactType.LEAD, result.type)

        verify(contactRepository).findByEmailAndTenantId(any(), eq(testTenantId))
        verify(contactRepository).save(any<ContactEntity>())
    }

    @Test
    fun `should update message status successfully`() {
        // Given
        val messageId = UUID.randomUUID()
        val newStatus = MessageStatus.DELIVERED
        val deliveredAt = LocalDateTime.now()

        val existingMessage = MessageEntity(
            id = messageId,
            threadId = testThreadId,
            direction = MessageDirection.OUTBOUND,
            externalId = "msg_123",
            content = "Test message",
            status = MessageStatus.SENT,
            tenantId = testTenantId,
            sentAt = LocalDateTime.now().minusMinutes(1),
            createdAt = LocalDateTime.now(),
            updatedAt = LocalDateTime.now()
        )

        val updatedMessage = existingMessage.copy(
            status = newStatus,
            deliveredAt = deliveredAt,
            updatedAt = LocalDateTime.now()
        )

        whenever(messageRepository.findByIdAndTenantId(messageId, testTenantId))
            .thenReturn(existingMessage)
        whenever(messageRepository.save(any<MessageEntity>()))
            .thenReturn(updatedMessage)

        // When
        val result = messagingService.updateMessageStatus(messageId, newStatus, testTenantId, deliveredAt)

        // Then
        assertNotNull(result)
        assertEquals(newStatus, result.status)
        assertEquals(deliveredAt, result.deliveredAt)

        verify(messageRepository).findByIdAndTenantId(messageId, testTenantId)
        verify(messageRepository).save(any<MessageEntity>())
    }
}