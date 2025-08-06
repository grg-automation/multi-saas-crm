// frontend/src/app/integrations/page.tsx
'use client'
import { useState } from 'react'

export default function IntegrationsPage() {
	const [kworkStatus, setKworkStatus] = useState('connecting...')
	const [telegramStatus, setTelegramStatus] = useState('connecting...')
	const [whatsappStatus, setWhatsappStatus] = useState('connecting...')
	const [notificationStatus, setNotificationStatus] = useState('connecting...')
	const [loading, setLoading] = useState(false)

	const checkAllStatuses = async () => {
		// Check Kwork service (direct)
		try {
			const kworkResponse = await fetch('http://localhost:8000/health')
			console.log('Kwork response:', kworkResponse.status)
			setKworkStatus(kworkResponse.ok ? 'connected ✅' : 'disconnected ❌')
		} catch (error) {
			console.error('Kwork error:', error)
			setKworkStatus('disconnected ❌')
		}

		// Check Notification service (direct)
		try {
			const notificationResponse = await fetch('http://localhost:3003/health')
			console.log('Notification response:', notificationResponse.status)
			setNotificationStatus(
				notificationResponse.ok ? 'connected ✅' : 'disconnected ❌'
			)
		} catch (error) {
			console.error('Notification error:', error)
			setNotificationStatus('disconnected ❌')
		}

		// Check Telegram V2 service
		try {
			const telegramResponse = await fetch(
				'http://localhost:3003/api/v1/telegram-user-v2/health'
			)
			console.log('Telegram V2 response:', telegramResponse.status)
			setTelegramStatus(
				telegramResponse.ok ? 'connected ✅' : 'disconnected ❌'
			)
		} catch (error) {
			console.error('Telegram error:', error)
			setTelegramStatus('disconnected ❌')
		}

		// Check WhatsApp service
		try {
			const whatsappResponse = await fetch(
				'http://localhost:3003/api/v1/whatsapp/health'
			)
			console.log('WhatsApp response:', whatsappResponse.status)
			setWhatsappStatus(
				whatsappResponse.ok ? 'connected ✅' : 'disconnected ❌'
			)
		} catch (error) {
			console.error('WhatsApp error:', error)
			setWhatsappStatus('disconnected ❌')
		}
	}

	const handleKworkSyncOrders = async () => {
		setLoading(true)
		try {
			// Use the correct endpoint from your router: /sync-orders
			const response = await fetch(
				'http://localhost:8000/api/v1/crm-sync/sync-orders',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						// Note: In real app, you'd get this from auth context
						Authorization:
							'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmOGU5ZDRhMS0yYjNjLTRkNWUtNmY3YS04YjljMGQxZTJmM2EiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwidGVuYW50X2lkIjoiZGVmYXVsdC10ZW5hbnQiLCJyb2xlIjoiQURNSU4iLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzU0NDEwOTk0LCJleHAiOjE3NTQ0OTczOTR9.Aa6x4L084mKWMzHkwx_Dd9n4KVY3Mhcp1bCEsmwrbsY',
						'X-Tenant-ID': '00000000-0000-0000-0000-000000000001',
					},
				}
			)

			if (response.ok) {
				const data = await response.json()
				alert(
					`✅ Kwork Orders Sync Successful!\n\n` +
						`📊 Results:\n` +
						`• Created Leads: ${data.data?.created_leads?.length || 0}\n` +
						`• Failed: ${data.data?.failed_leads?.length || 0}\n` +
						`• Total Processed: ${data.data?.total_processed || 0}\n` +
						`• Tenant: ${data.data?.tenant_id || 'N/A'}\n\n` +
						`Message: ${data.message}`
				)
			} else {
				const error = await response.text()
				alert(`❌ Sync failed: ${error}`)
			}
		} catch (error) {
			alert(`❌ Sync error: ${error.message}`)
		}
		setLoading(false)
	}

	const handleKworkSyncContacts = async () => {
		setLoading(true)
		try {
			// Use the contact sync endpoint
			const response = await fetch(
				'http://localhost:8000/api/v1/crm-sync/sync-contacts',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization:
							'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmOGU5ZDRhMS0yYjNjLTRkNWUtNmY3YS04YjljMGQxZTJmM2EiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwidGVuYW50X2lkIjoiZGVmYXVsdC10ZW5hbnQiLCJyb2xlIjoiQURNSU4iLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzU0NDEwOTk0LCJleHAiOjE3NTQ0OTczOTR9.Aa6x4L084mKWMzHkwx_Dd9n4KVY3Mhcp1bCEsmwrbsY',
						'X-Tenant-ID': '00000000-0000-0000-0000-000000000001',
					},
				}
			)

			if (response.ok) {
				const data = await response.json()
				alert(
					`✅ Kwork Contacts Sync Successful!\n\n` +
						`📊 Contact Created:\n` +
						`• Contact ID: ${data.data?.contact_id || 'N/A'}\n` +
						`• Contact Name: ${data.data?.contact_name || 'N/A'}\n` +
						`• Tenant: ${data.data?.tenant_id || 'N/A'}\n\n` +
						`Message: ${data.message}`
				)
			} else {
				const error = await response.text()
				alert(`❌ Contact sync failed: ${error}`)
			}
		} catch (error) {
			alert(`❌ Contact sync error: ${error.message}`)
		}
		setLoading(false)
	}

	const handleKworkSyncStatus = async () => {
		setLoading(true)
		try {
			// Check sync status
			const response = await fetch(
				'http://localhost:8000/api/v1/crm-sync/sync-status',
				{
					headers: {
						Authorization:
							'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmOGU5ZDRhMS0yYjNjLTRkNWUtNmY3YS04YjljMGQxZTJmM2EiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwidGVuYW50X2lkIjoiZGVmYXVsdC10ZW5hbnQiLCJyb2xlIjoiQURNSU4iLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzU0NDEwOTk0LCJleHAiOjE3NTQ0OTczOTR9.Aa6x4L084mKWMzHkwx_Dd9n4KVY3Mhcp1bCEsmwrbsY',
						'X-Tenant-ID': '00000000-0000-0000-0000-000000000001',
					},
				}
			)

			if (response.ok) {
				const data = await response.json()
				alert(
					`📊 Kwork Sync Status:\n\n` +
						`• crm Available: ${data.crm_available ? '✅ Yes' : '❌ No'}\n` +
						`• Tenant ID: ${data.tenant_id}\n` +
						`• Sync Enabled: ${data.sync_enabled ? '✅ Yes' : '❌ No'}\n` +
						`• Last Sync: ${data.last_sync || 'Never'}\n\n` +
						JSON.stringify(data, null, 2)
				)
			} else {
				const error = await response.text()
				alert(`❌ Status check failed: ${error}`)
			}
		} catch (error) {
			alert(`❌ Status error: ${error.message}`)
		}
		setLoading(false)
	}

	const handleTelegramTest = async () => {
		setLoading(true)
		try {
			const healthResponse = await fetch(
				'http://localhost:3003/api/v1/telegram-user-v2/health'
			)

			if (healthResponse.ok) {
				const healthData = await healthResponse.json()
				alert(
					`✅ Telegram Service V2 Status:\n${JSON.stringify(healthData, null, 2)}`
				)
			} else {
				alert(`❌ Telegram service not available`)
			}
		} catch (error) {
			alert(`❌ Telegram error: ${error.message}`)
		}
		setLoading(false)
	}

	const handleWhatsAppTest = async () => {
		setLoading(true)
		try {
			const healthResponse = await fetch(
				'http://localhost:3003/api/v1/whatsapp/health'
			)

			if (healthResponse.ok) {
				const healthData = await healthResponse.json()
				alert(
					`✅ WhatsApp Service Status:\n${JSON.stringify(healthData, null, 2)}`
				)
			} else {
				alert(`❌ WhatsApp service not available`)
			}
		} catch (error) {
			alert(`❌ WhatsApp error: ${error.message}`)
		}
		setLoading(false)
	}

	const handleTelegramSessionStatus = async () => {
		setLoading(true)
		try {
			const response = await fetch(
				'http://localhost:3003/api/v1/telegram-user-v2/sessions'
			)

			if (response.ok) {
				const data = await response.json()
				alert(`📱 Telegram Sessions:\n${JSON.stringify(data, null, 2)}`)
			} else {
				const error = await response.text()
				alert(`❌ Failed to get sessions: ${error}`)
			}
		} catch (error) {
			alert(`❌ Session error: ${error.message}`)
		}
		setLoading(false)
	}

	return (
		<div className='p-6'>
			<h1 className='text-2xl font-bold mb-6'>🔌 crm Integrations</h1>

			<div className='mb-4'>
				<button
					onClick={checkAllStatuses}
					className='bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 mr-2'
				>
					🔄 Refresh All Status
				</button>
			</div>

			<div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
				{/* Kwork Integration */}
				<div className='border rounded-lg p-4 bg-blue-50'>
					<h3 className='text-lg font-semibold'>🏗️ Kwork Integration</h3>
					<p className='text-sm text-gray-600'>
						Freelance platform sync (Python FastAPI)
					</p>
					<div className='mt-2'>
						<span className='text-sm'>Status: {kworkStatus}</span>
					</div>
					<div className='mt-1 text-xs text-gray-500'>
						Port: 8000 • Service: kwork-service
					</div>
					<div className='mt-3 space-x-2'>
						<button
							onClick={handleKworkSyncOrders}
							disabled={loading}
							className='bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm'
						>
							{loading ? '⏳' : '📦'} Sync Orders
						</button>
						<button
							onClick={handleKworkSyncContacts}
							disabled={loading}
							className='bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600 disabled:bg-gray-400 text-sm'
						>
							{loading ? '⏳' : '👤'} Sync Contacts
						</button>
						<button
							onClick={handleKworkSyncStatus}
							disabled={loading}
							className='bg-gray-500 text-white px-3 py-2 rounded hover:bg-gray-600 disabled:bg-gray-400 text-sm'
						>
							{loading ? '⏳' : '📊'} Status
						</button>
					</div>
				</div>

				{/* Rest of your components remain the same... */}
				{/* Telegram Integration */}
				<div className='border rounded-lg p-4 bg-green-50'>
					<h3 className='text-lg font-semibold'>🤖 Telegram Bot V2</h3>
					<p className='text-sm text-gray-600'>GramJS User API (Node.js)</p>
					<div className='mt-2'>
						<span className='text-sm'>Status: {telegramStatus}</span>
					</div>
					<div className='mt-1 text-xs text-gray-500'>
						Port: 3003 • Service: notification-service
					</div>
					<div className='mt-3 space-x-2'>
						<button
							onClick={handleTelegramTest}
							disabled={loading}
							className='bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600 disabled:bg-gray-400 text-sm'
						>
							{loading ? '⏳' : '🏥'} Health Check
						</button>
						<button
							onClick={handleTelegramSessionStatus}
							disabled={loading}
							className='bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm'
						>
							{loading ? '⏳' : '📱'} Sessions
						</button>
					</div>
				</div>

				{/* WhatsApp Integration */}
				<div className='border rounded-lg p-4 bg-green-50'>
					<h3 className='text-lg font-semibold'>💬 WhatsApp Business</h3>
					<p className='text-sm text-gray-600'>Business API integration</p>
					<div className='mt-2'>
						<span className='text-sm'>Status: {whatsappStatus}</span>
					</div>
					<div className='mt-1 text-xs text-gray-500'>
						Port: 3003 • Service: notification-service
					</div>
					<button
						onClick={handleWhatsAppTest}
						disabled={loading}
						className='mt-3 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400'
					>
						{loading ? '⏳ Testing...' : '🏥 Health Check'}
					</button>
				</div>

				{/* System Health Dashboard */}
				<div className='border rounded-lg p-4 bg-gray-50'>
					<h3 className='text-lg font-semibold'>🛠️ System Health</h3>
					<p className='text-sm text-gray-600'>Microservices status</p>
					<div className='mt-2 space-y-1 text-sm'>
						<div>🏗️ Kwork Service: {kworkStatus}</div>
						<div>📱 Telegram V2: {telegramStatus}</div>
						<div>💬 WhatsApp: {whatsappStatus}</div>
						<div>🔔 Notifications: {notificationStatus}</div>
						<div>🌐 API Gateway: ✅ Running (Port 3001)</div>
					</div>
				</div>
			</div>

			{/* Architecture Overview */}
			<div className='mt-8 p-4 bg-blue-50 rounded-lg'>
				<h3 className='text-lg font-semibold mb-2'>
					🏗️ Microservices Architecture
				</h3>
				<div className='text-sm space-y-2'>
					<div className='font-medium'>Event-Driven Communication:</div>
					<div className='pl-4 space-y-1'>
						<div>
							📊 <strong>Frontend (Next.js)</strong> → API Gateway (Express) →
							Services
						</div>
						<div>
							🐍 <strong>Kwork Service</strong> (Python FastAPI) - Port 8000
						</div>
						<div>
							🟢 <strong>Notification Service</strong> (Node.js/NestJS) - Port
							3003
						</div>
						<div>
							☕ <strong>Core crm</strong> (Kotlin Spring Boot) - Port 8080
						</div>
						<div>
							🗄️ <strong>PostgreSQL</strong> (Multi-tenant database)
						</div>
						<div>
							🔴 <strong>Redis</strong> (Cache & sessions)
						</div>
						<div>
							📡 <strong>Kafka</strong> (Event streaming)
						</div>
					</div>
				</div>
			</div>

			{/* Demo Instructions - Updated */}
			<div className='mt-4 p-4 bg-yellow-50 rounded-lg'>
				<h3 className='text-lg font-semibold mb-2'>🎯 Demo Instructions</h3>
				<div className='text-sm space-y-1'>
					<p>
						1. <strong>Click "Refresh All Status"</strong> - Shows microservices
						connectivity
					</p>
					<p>
						2. <strong>Click "Sync Orders"</strong> - Syncs Kwork orders to crm
						leads
					</p>
					<p>
						3. <strong>Click "Sync Contacts"</strong> - Syncs Kwork user to crm
						contact
					</p>
					<p>
						4. <strong>Click "Status"</strong> - Shows crm integration status
					</p>
					<p>
						5. <strong>Multiple accounts supported</strong> - Can add secondary
						Kwork accounts
					</p>
				</div>
			</div>
		</div>
	)
}
