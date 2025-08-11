'use client'
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
	Calendar,
	CheckCircle2,
	ChevronDown,
	Clock,
	Filter,
	Folder,
	MoreHorizontal,
	Plus,
	Search,
	Settings,
	Share,
	Star,
	Users,
	View,
} from 'lucide-react'
import { useEffect, useState } from 'react'

// Define Board and Item types (Monday.com-style)
interface BoardItem {
	id: string
	name: string
	status: 'Stuck' | 'Working on it' | 'Done' | 'Not Started'
	priority: 'Critical' | 'High' | 'Medium' | 'Low'
	owner: string
	dueDate?: string
	budget?: number
	progress: number
	timeline: {
		start: string
		end: string
	}
	tags: string[]
	notes?: string
	files?: number
}

interface Board {
	id: string
	name: string
	description: string
	color: string
	items: BoardItem[]
	views: string[]
	members: string[]
	isStarred: boolean
}

// Mock data
const initialBoards: Board[] = [
	{
		id: '1',
		name: 'CRM Development Project',
		description: 'Main development board for CRM system',
		color: 'bg-blue-500',
		isStarred: true,
		members: ['John Doe', 'Jane Smith', 'Mike Johnson'],
		views: ['Main Table', 'Kanban', 'Calendar', 'Timeline'],
		items: [
			{
				id: '1',
				name: 'Implement Telegram Integration',
				status: 'Done',
				priority: 'High',
				owner: 'John Doe',
				dueDate: '2024-01-25',
				budget: 15000,
				progress: 100,
				timeline: { start: '2024-01-10', end: '2024-01-25' },
				tags: ['Backend', 'Integration', 'Messaging'],
				notes: 'Successfully integrated Telegram API with enhanced message handling'
			},
			{
				id: '2',
				name: 'WhatsApp Integration Enhancement',
				status: 'Done',
				priority: 'High',
				owner: 'Jane Smith',
				dueDate: '2024-01-28',
				budget: 12000,
				progress: 100,
				timeline: { start: '2024-01-15', end: '2024-01-28' },
				tags: ['Backend', 'Integration', 'Messaging'],
				notes: 'Enhanced WhatsApp adapter with CRM activity mapping'
			},
			{
				id: '3',
				name: 'Kwork Service CRM Sync',
				status: 'Working on it',
				priority: 'Medium',
				owner: 'Mike Johnson',
				dueDate: '2024-02-05',
				budget: 8000,
				progress: 75,
				timeline: { start: '2024-01-20', end: '2024-02-05' },
				tags: ['Backend', 'CRM', 'Integration'],
				notes: 'Enhanced CRM integration with opportunities and activities'
			},
			{
				id: '4',
				name: 'Multi-tenant Architecture Setup',
				status: 'Not Started',
				priority: 'Critical',
				owner: 'John Doe',
				dueDate: '2024-02-15',
				budget: 25000,
				progress: 0,
				timeline: { start: '2024-02-01', end: '2024-02-15' },
				tags: ['Architecture', 'Security', 'Backend'],
				notes: 'Implement tenant isolation and data security'
			}
		]
	},
	{
		id: '2',
		name: 'Marketing Campaigns',
		description: 'Track marketing initiatives and campaigns',
		color: 'bg-green-500',
		isStarred: false,
		members: ['Sarah Wilson', 'Tom Brown'],
		views: ['Main Table', 'Calendar'],
		items: [
			{
				id: '5',
				name: 'Q1 Social Media Campaign',
				status: 'Working on it',
				priority: 'Medium',
				owner: 'Sarah Wilson',
				dueDate: '2024-03-31',
				budget: 10000,
				progress: 30,
				timeline: { start: '2024-01-01', end: '2024-03-31' },
				tags: ['Marketing', 'Social Media'],
				files: 5
			},
			{
				id: '6',
				name: 'Product Launch Event',
				status: 'Not Started',
				priority: 'High',
				owner: 'Tom Brown',
				dueDate: '2024-04-15',
				budget: 50000,
				progress: 0,
				timeline: { start: '2024-03-01', end: '2024-04-15' },
				tags: ['Event', 'Launch', 'Marketing']
			}
		]
	},
	{
		id: '3',
		name: 'Sales Pipeline',
		description: 'Track leads and opportunities through sales process',
		color: 'bg-purple-500',
		isStarred: true,
		members: ['Alex Chen', 'Lisa Garcia'],
		views: ['Main Table', 'Kanban', 'Chart'],
		items: [
			{
				id: '7',
				name: 'Enterprise Client - Tech Corp',
				status: 'Working on it',
				priority: 'Critical',
				owner: 'Alex Chen',
				dueDate: '2024-02-10',
				budget: 150000,
				progress: 60,
				timeline: { start: '2024-01-05', end: '2024-02-10' },
				tags: ['Enterprise', 'B2B', 'Priority']
			}
		]
	}
]

export default function BoardsPage() {
	const [boards, setBoards] = useState<Board[]>(initialBoards)
	const [selectedBoard, setSelectedBoard] = useState<Board | null>(boards[0])
	const [viewMode, setViewMode] = useState<string>('Main Table')
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<string>('all')
	const [priorityFilter, setPriorityFilter] = useState<string>('all')
	const [showNewItemForm, setShowNewItemForm] = useState(false)
	const [newItem, setNewItem] = useState({
		name: '',
		status: 'Not Started' as BoardItem['status'],
		priority: 'Medium' as BoardItem['priority'],
		owner: '',
		dueDate: '',
		budget: 0,
		notes: ''
	})

	useEffect(() => {
		async function loadBoards() {
			try {
				setLoading(true)
				// Simulate API call
				await new Promise(resolve => setTimeout(resolve, 500))
			} catch (error) {
				console.error('Error loading boards:', error)
			} finally {
				setLoading(false)
			}
		}
		loadBoards()
	}, [])

	const getStatusColor = (status: BoardItem['status']) => {
		switch (status) {
			case 'Done': return 'bg-green-100 text-green-800'
			case 'Working on it': return 'bg-blue-100 text-blue-800'
			case 'Stuck': return 'bg-red-100 text-red-800'
			case 'Not Started': return 'bg-gray-100 text-gray-800'
			default: return 'bg-gray-100 text-gray-800'
		}
	}

	const getPriorityColor = (priority: BoardItem['priority']) => {
		switch (priority) {
			case 'Critical': return 'bg-red-500 text-white'
			case 'High': return 'bg-orange-500 text-white'
			case 'Medium': return 'bg-yellow-500 text-white'
			case 'Low': return 'bg-green-500 text-white'
			default: return 'bg-gray-500 text-white'
		}
	}

	const getFilteredItems = () => {
		if (!selectedBoard) return []
		
		let items = selectedBoard.items
		
		if (searchTerm) {
			items = items.filter(item =>
				item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				item.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
				item.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
			)
		}
		
		if (statusFilter !== 'all') {
			items = items.filter(item => item.status === statusFilter)
		}
		
		if (priorityFilter !== 'all') {
			items = items.filter(item => item.priority === priorityFilter)
		}
		
		return items
	}

	const addNewItem = () => {
		if (!selectedBoard || !newItem.name.trim()) return

		const item: BoardItem = {
			id: Date.now().toString(),
			name: newItem.name,
			status: newItem.status,
			priority: newItem.priority,
			owner: newItem.owner,
			dueDate: newItem.dueDate || undefined,
			budget: newItem.budget || undefined,
			progress: 0,
			timeline: { 
				start: new Date().toISOString().split('T')[0], 
				end: newItem.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
			},
			tags: [],
			notes: newItem.notes || undefined
		}

		const updatedBoard = {
			...selectedBoard,
			items: [...selectedBoard.items, item]
		}

		setBoards(boards.map(b => b.id === selectedBoard.id ? updatedBoard : b))
		setSelectedBoard(updatedBoard)

		setNewItem({
			name: '',
			status: 'Not Started',
			priority: 'Medium',
			owner: '',
			dueDate: '',
			budget: 0,
			notes: ''
		})
		setShowNewItemForm(false)
	}

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat('ru-RU', {
			style: 'currency',
			currency: 'RUB'
		}).format(amount)
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('ru-RU', {
			day: 'numeric',
			month: 'short'
		})
	}

	if (loading) {
		return (
			<AuthenticatedLayout>
				<div className="p-6">
					<div className="flex items-center justify-center h-64">
						<div className="text-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
							<p className="mt-2 text-gray-600">Загрузка досок...</p>
						</div>
					</div>
				</div>
			</AuthenticatedLayout>
		)
	}

	return (
		<AuthenticatedLayout>
			<div className="min-h-screen bg-gray-50">
				{/* Header */}
				<div className="bg-white border-b shadow-sm">
					<div className="px-6 py-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center space-x-4">
								<h1 className="text-2xl font-bold text-gray-900">Доски проектов</h1>
								{selectedBoard && (
									<Badge className={`${selectedBoard.color} text-white`}>
										{selectedBoard.name}
									</Badge>
								)}
							</div>
							<div className="flex items-center space-x-3">
								<Button variant="outline" size="sm">
									<Share className="h-4 w-4 mr-2" />
									Поделиться
								</Button>
								<Button variant="outline" size="sm">
									<Settings className="h-4 w-4 mr-2" />
									Настройки
								</Button>
								<Button size="sm" onClick={() => setShowNewItemForm(true)}>
									<Plus className="h-4 w-4 mr-2" />
									Добавить элемент
								</Button>
							</div>
						</div>
					</div>
				</div>

				<div className="flex">
					{/* Sidebar - Boards List */}
					<div className="w-80 bg-white border-r h-screen overflow-y-auto">
						<div className="p-4">
							<div className="flex items-center justify-between mb-4">
								<h2 className="font-semibold text-gray-900">Мои доски</h2>
								<Button variant="ghost" size="sm">
									<Plus className="h-4 w-4" />
								</Button>
							</div>
							
							{/* Starred Boards */}
							<div className="mb-6">
								<div className="flex items-center mb-2">
									<Star className="h-4 w-4 text-yellow-500 mr-1" />
									<span className="text-sm font-medium text-gray-700">Избранное</span>
								</div>
								{boards.filter(board => board.isStarred).map(board => (
									<div
										key={`starred-${board.id}`}
										className={`flex items-center p-2 rounded cursor-pointer hover:bg-gray-50 ${selectedBoard?.id === board.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
										onClick={() => setSelectedBoard(board)}
									>
										<div className={`w-3 h-3 rounded mr-3 ${board.color}`}></div>
										<span className="text-sm text-gray-900">{board.name}</span>
									</div>
								))}
							</div>

							{/* All Boards */}
							<div>
								<div className="flex items-center mb-2">
									<Folder className="h-4 w-4 text-gray-500 mr-1" />
									<span className="text-sm font-medium text-gray-700">Все доски</span>
								</div>
								{boards.map(board => (
									<div
										key={board.id}
										className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-50 ${selectedBoard?.id === board.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
										onClick={() => setSelectedBoard(board)}
									>
										<div className="flex items-center">
											<div className={`w-3 h-3 rounded mr-3 ${board.color}`}></div>
											<div>
												<span className="text-sm text-gray-900">{board.name}</span>
												<div className="text-xs text-gray-500">{board.items.length} элементов</div>
											</div>
										</div>
										<div className="flex items-center">
											{board.isStarred && <Star className="h-3 w-3 text-yellow-500" />}
											<Users className="h-3 w-3 text-gray-400 ml-1" />
											<span className="text-xs text-gray-500 ml-1">{board.members.length}</span>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* Main Content */}
					<div className="flex-1 p-6">
						{selectedBoard && (
							<>
								{/* Board Header */}
								<div className="mb-6">
									<div className="flex items-center justify-between mb-4">
										<div>
											<h2 className="text-xl font-bold text-gray-900">{selectedBoard.name}</h2>
											<p className="text-gray-600">{selectedBoard.description}</p>
										</div>
										<div className="flex items-center space-x-3">
											<Select value={viewMode} onValueChange={setViewMode}>
												<SelectTrigger className="w-40">
													<View className="h-4 w-4 mr-2" />
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{selectedBoard.views.map(view => (
														<SelectItem key={view} value={view}>{view}</SelectItem>
													))}
												</SelectContent>
											</Select>
											<Button variant="outline" size="sm">
												<Filter className="h-4 w-4 mr-2" />
												Фильтры
											</Button>
										</div>
									</div>

									{/* Filters and Search */}
									<Card className="mb-6">
										<CardContent className="p-4">
											<div className="flex items-center gap-4">
												<div className="flex-1">
													<div className="relative">
														<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
														<Input
															placeholder="Поиск элементов..."
															value={searchTerm}
															onChange={e => setSearchTerm(e.target.value)}
															className="pl-10"
														/>
													</div>
												</div>
												<Select value={statusFilter} onValueChange={setStatusFilter}>
													<SelectTrigger className="w-40">
														<SelectValue placeholder="Статус" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="all">Все статусы</SelectItem>
														<SelectItem value="Not Started">Не начато</SelectItem>
														<SelectItem value="Working on it">В работе</SelectItem>
														<SelectItem value="Stuck">Застряло</SelectItem>
														<SelectItem value="Done">Завершено</SelectItem>
													</SelectContent>
												</Select>
												<Select value={priorityFilter} onValueChange={setPriorityFilter}>
													<SelectTrigger className="w-40">
														<SelectValue placeholder="Приоритет" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="all">Все приоритеты</SelectItem>
														<SelectItem value="Low">Низкий</SelectItem>
														<SelectItem value="Medium">Средний</SelectItem>
														<SelectItem value="High">Высокий</SelectItem>
														<SelectItem value="Critical">Критический</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</CardContent>
									</Card>
								</div>

								{/* New Item Form */}
								{showNewItemForm && (
									<Card className="mb-6">
										<CardHeader>
											<CardTitle>Новый элемент</CardTitle>
										</CardHeader>
										<CardContent className="space-y-4">
											<Input
												placeholder="Название элемента"
												value={newItem.name}
												onChange={e => setNewItem({ ...newItem, name: e.target.value })}
											/>
											<div className="grid grid-cols-3 gap-4">
												<Select
													value={newItem.status}
													onValueChange={(value: BoardItem['status']) =>
														setNewItem({ ...newItem, status: value })
													}
												>
													<SelectTrigger>
														<SelectValue placeholder="Статус" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="Not Started">Не начато</SelectItem>
														<SelectItem value="Working on it">В работе</SelectItem>
														<SelectItem value="Stuck">Застряло</SelectItem>
														<SelectItem value="Done">Завершено</SelectItem>
													</SelectContent>
												</Select>
												<Select
													value={newItem.priority}
													onValueChange={(value: BoardItem['priority']) =>
														setNewItem({ ...newItem, priority: value })
													}
												>
													<SelectTrigger>
														<SelectValue placeholder="Приоритет" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="Low">Низкий</SelectItem>
														<SelectItem value="Medium">Средний</SelectItem>
														<SelectItem value="High">Высокий</SelectItem>
														<SelectItem value="Critical">Критический</SelectItem>
													</SelectContent>
												</Select>
												<Input
													placeholder="Ответственный"
													value={newItem.owner}
													onChange={e => setNewItem({ ...newItem, owner: e.target.value })}
												/>
											</div>
											<div className="grid grid-cols-2 gap-4">
												<Input
													type="date"
													value={newItem.dueDate}
													onChange={e => setNewItem({ ...newItem, dueDate: e.target.value })}
												/>
												<Input
													type="number"
													placeholder="Бюджет"
													value={newItem.budget || ''}
													onChange={e => setNewItem({ ...newItem, budget: Number(e.target.value) })}
												/>
											</div>
											<Textarea
												placeholder="Заметки (необязательно)"
												value={newItem.notes}
												onChange={e => setNewItem({ ...newItem, notes: e.target.value })}
											/>
											<div className="flex gap-2">
												<Button onClick={addNewItem}>Создать</Button>
												<Button variant="outline" onClick={() => setShowNewItemForm(false)}>
													Отмена
												</Button>
											</div>
										</CardContent>
									</Card>
								)}

								{/* Monday.com-style Table */}
								<Card>
									<div className="overflow-x-auto">
										<table className="w-full">
											<thead className="bg-gray-50">
												<tr>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-80">
														Элемент
													</th>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
														Статус
													</th>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
														Приоритет
													</th>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
														Ответственный
													</th>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
														Срок
													</th>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
														Прогресс
													</th>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
														Бюджет
													</th>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
														Теги
													</th>
													<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
														Действия
													</th>
												</tr>
											</thead>
											<tbody className="bg-white divide-y divide-gray-200">
												{getFilteredItems().map(item => (
													<tr key={item.id} className="hover:bg-gray-50">
														<td className="px-6 py-4">
															<div>
																<div className="text-sm font-medium text-gray-900">
																	{item.name}
																</div>
																{item.notes && (
																	<div className="text-sm text-gray-500 mt-1">
																		{item.notes}
																	</div>
																)}
															</div>
														</td>
														<td className="px-6 py-4">
															<Badge className={getStatusColor(item.status)}>
																{item.status}
															</Badge>
														</td>
														<td className="px-6 py-4">
															<Badge className={getPriorityColor(item.priority)}>
																{item.priority}
															</Badge>
														</td>
														<td className="px-6 py-4">
															<div className="flex items-center">
																<div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-gray-700">
																	{item.owner.split(' ').map(n => n[0]).join('')}
																</div>
																<span className="ml-2 text-sm text-gray-900">{item.owner}</span>
															</div>
														</td>
														<td className="px-6 py-4">
															{item.dueDate && (
																<div className="flex items-center text-sm text-gray-600">
																	<Calendar className="h-4 w-4 mr-1" />
																	{formatDate(item.dueDate)}
																</div>
															)}
														</td>
														<td className="px-6 py-4">
															<div className="flex items-center">
																<div className="w-full bg-gray-200 rounded-full h-2 mr-2">
																	<div
																		className="bg-blue-600 h-2 rounded-full"
																		style={{ width: `${item.progress}%` }}
																	></div>
																</div>
																<span className="text-sm text-gray-600">{item.progress}%</span>
															</div>
														</td>
														<td className="px-6 py-4">
															{item.budget && (
																<span className="text-sm font-medium text-gray-900">
																	{formatCurrency(item.budget)}
																</span>
															)}
														</td>
														<td className="px-6 py-4">
															<div className="flex flex-wrap gap-1">
																{item.tags.slice(0, 3).map(tag => (
																	<Badge key={tag} variant="secondary" className="text-xs">
																		{tag}
																	</Badge>
																))}
																{item.tags.length > 3 && (
																	<Badge variant="secondary" className="text-xs">
																		+{item.tags.length - 3}
																	</Badge>
																)}
															</div>
														</td>
														<td className="px-6 py-4">
															<Button variant="ghost" size="sm">
																<MoreHorizontal className="h-4 w-4" />
															</Button>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</Card>

								{/* Board Stats */}
								<div className="grid grid-cols-4 gap-4 mt-6">
									<Card>
										<CardContent className="p-4">
											<div className="text-2xl font-bold text-gray-900">
												{selectedBoard.items.length}
											</div>
											<div className="text-sm text-gray-600">Всего элементов</div>
										</CardContent>
									</Card>
									<Card>
										<CardContent className="p-4">
											<div className="text-2xl font-bold text-green-600">
												{selectedBoard.items.filter(item => item.status === 'Done').length}
											</div>
											<div className="text-sm text-gray-600">Завершено</div>
										</CardContent>
									</Card>
									<Card>
										<CardContent className="p-4">
											<div className="text-2xl font-bold text-blue-600">
												{selectedBoard.items.filter(item => item.status === 'Working on it').length}
											</div>
											<div className="text-sm text-gray-600">В работе</div>
										</CardContent>
									</Card>
									<Card>
										<CardContent className="p-4">
											<div className="text-2xl font-bold text-gray-600">
												{Math.round(selectedBoard.items.reduce((sum, item) => sum + item.progress, 0) / selectedBoard.items.length)}%
											</div>
											<div className="text-sm text-gray-600">Средний прогресс</div>
										</CardContent>
									</Card>
								</div>

								{/* Backend Integration Note */}
								<Card className="mt-6 border-yellow-200 bg-yellow-50">
									<CardContent className="p-4">
										<div className="flex items-start space-x-3">
											<div className="text-yellow-600 text-lg">⚠️</div>
											<div>
												<h4 className="font-medium text-yellow-800">Backend Integration</h4>
												<p className="text-sm text-yellow-700 mt-1">
													Эта Monday.com-style доска использует mock данные. Для полной функциональности необходимо:
												</p>
												<ul className="text-sm text-yellow-700 mt-2 list-disc list-inside">
													<li>Создать API endpoints для досок и элементов проектов</li>
													<li>Добавить модели Board, BoardItem, Project в backend</li>
													<li>Реализовать CRUD операции с правами доступа</li>
													<li>Добавить real-time обновления через WebSocket</li>
													<li>Интегрировать с CRM для автоматического создания задач</li>
												</ul>
											</div>
										</div>
									</CardContent>
								</Card>
							</>
						)}
					</div>
				</div>
			</div>
		</AuthenticatedLayout>
	)
}