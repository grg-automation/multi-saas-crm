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
import { useAuth } from '@/hooks/useAuth' // Assume this provides token and tenantId
import {
	AlertCircle,
	Calendar,
	CheckCircle2,
	Circle,
	Clock,
	GripVertical,
	LayoutGrid,
	List,
	Plus,
	Search,
	Trash2,
	User,
	XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'

// Define Task and Column types (add linkedTo per spec for CRM object linking)
interface Task {
	id: string
	title: string
	description?: string
	status: string
	priority: 'Low' | 'Medium' | 'High' | 'Critical'
	assignedTo?: string
	createdAt: string
	dueDate?: string
	linkedTo?: string // e.g., 'contact:123' or 'deal:456' – extend for spec's linking
}
interface Column {
	id: string
	title: string
	color: string
	tasks: Task[]
}
// API base URL
const API_BASE = 'http://localhost:3001/api/v1'
// Hardcoded columns (map statuses to these)
const COLUMNS_CONFIG: Omit<Column, 'tasks'>[] = [
	{ id: 'todo', title: 'To Do', color: 'bg-gray-100' },
	{ id: 'inprogress', title: 'In Progress', color: 'bg-blue-100' },
	{ id: 'review', title: 'Review', color: 'bg-yellow-100' },
	{ id: 'done', title: 'Done', color: 'bg-green-100' },
]
export default function TasksPage() {
	const [columns, setColumns] = useState<Column[]>(
		COLUMNS_CONFIG.map(col => ({ ...col, tasks: [] }))
	)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [showNewTaskForm, setShowNewTaskForm] = useState(false)
	const [draggedTask, setDraggedTask] = useState<Task | null>(null)
	const [draggedFrom, setDraggedFrom] = useState<string | null>(null)
	const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<string>('all')
	const [priorityFilter, setPriorityFilter] = useState<string>('all')
	const [newTask, setNewTask] = useState({
		title: '',
		description: '',
		priority: 'Medium' as Task['priority'],
		assignedTo: '',
		dueDate: '',
		linkedTo: '', // New field for spec's linking to CRM objects
	})
	const { token, tenantId } = useAuth()

	useEffect(() => {
		fetchTasks()
	}, [])

	const getHeaders = () => ({
		Authorization: `Bearer ${token}`,
		'X-Tenant-ID': tenantId,
		'Content-Type': 'application/json',
	})

	const fetchTasks = async () => {
		setLoading(true)
		setError(null)
		try {
			const response = await fetch(`${API_BASE}/tasks`, {
				headers: getHeaders(),
			})
			if (!response.ok) throw new Error('Failed to fetch tasks')
			const tasks: Task[] = await response.json()
			const groupedColumns = COLUMNS_CONFIG.map(col => ({
				...col,
				tasks: tasks.filter(task => task.status === col.title),
			}))
			setColumns(groupedColumns)
		} catch (err) {
			setError('Error loading tasks. Please try again.')
			console.error(err)
		} finally {
			setLoading(false)
		}
	}

	// Get all tasks flat
	const getAllTasks = () => columns.flatMap(col => col.tasks)

	// Filtered tasks for table
	const getFilteredTasks = () => {
		let tasks = getAllTasks()
		if (searchTerm) {
			tasks = tasks.filter(
				task =>
					task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
					task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					task.assignedTo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					task.linkedTo?.toLowerCase().includes(searchTerm.toLowerCase())
			)
		}
		if (statusFilter !== 'all')
			tasks = tasks.filter(task => task.status === statusFilter)
		if (priorityFilter !== 'all')
			tasks = tasks.filter(task => task.priority === priorityFilter)
		return tasks
	}

	const addNewTask = async () => {
		if (!newTask.title.trim()) return
		const taskPayload = {
			title: newTask.title,
			description: newTask.description,
			status: 'To Do',
			priority: newTask.priority,
			assignedTo: newTask.assignedTo,
			dueDate: newTask.dueDate ? `${newTask.dueDate}T00:00:00` : undefined, // To LocalDateTime
			linkedTo: newTask.linkedTo || undefined,
		}
		try {
			const response = await fetch(`${API_BASE}/tasks`, {
				method: 'POST',
				headers: getHeaders(),
				body: JSON.stringify(taskPayload),
			})
			if (!response.ok) throw new Error('Failed to create task')
			await fetchTasks()
			setNewTask({
				title: '',
				description: '',
				priority: 'Medium',
				assignedTo: '',
				dueDate: '',
				linkedTo: '',
			})
			setShowNewTaskForm(false)
		} catch (err) {
			setError('Error creating task.')
			console.error(err)
		}
	}

	const deleteTask = async (taskId: string) => {
		try {
			const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
				method: 'DELETE',
				headers: getHeaders(),
			})
			if (!response.ok) throw new Error('Failed to delete task')
			await fetchTasks()
		} catch (err) {
			setError('Error deleting task.')
			console.error(err)
		}
	}

	const updateTaskStatus = async (taskId: string, newStatus: string) => {
		try {
			const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
				method: 'PUT',
				headers: getHeaders(),
				body: JSON.stringify({ status: newStatus }),
			})
			if (!response.ok) throw new Error('Failed to update task')
			await fetchTasks()
		} catch (err) {
			setError('Error updating task.')
			console.error(err)
		}
	}

	// Drag-and-drop handlers (update to call updateTaskStatus on drop)
	const handleDragStart = (
		e: React.DragEvent,
		task: Task,
		columnId: string
	) => {
		setDraggedTask(task)
		setDraggedFrom(columnId)
		e.dataTransfer.effectAllowed = 'move'
		e.currentTarget.style.opacity = '0.5'
	}

	const handleDragEnd = (e: React.DragEvent) => {
		e.currentTarget.style.opacity = '1'
		setDraggedTask(null)
		setDraggedFrom(null)
	}

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
	}

	const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
		e.preventDefault()
		if (!draggedTask || !draggedFrom || draggedFrom === targetColumnId) return
		const targetColumn = columns.find(col => col.id === targetColumnId)
		if (!targetColumn) return
		await updateTaskStatus(draggedTask.id, targetColumn.title) // Call API to update status
	}

	const getPriorityColor = (priority: Task['priority']) => {
		switch (priority) {
			case 'Critical':
				return 'bg-red-500'
			case 'High':
				return 'bg-orange-500'
			case 'Medium':
				return 'bg-yellow-500'
			case 'Low':
				return 'bg-green-500'
			default:
				return 'bg-gray-500'
		}
	}

	const getPriorityIcon = (priority: Task['priority']) => {
		switch (priority) {
			case 'Critical':
				return <XCircle className='h-4 w-4 text-red-500' />
			case 'High':
				return <AlertCircle className='h-4 w-4 text-orange-500' />
			case 'Medium':
				return <Circle className='h-4 w-4 text-yellow-500' />
			case 'Low':
				return <CheckCircle2 className='h-4 w-4 text-green-500' />
			default:
				return <Circle className='h-4 w-4 text-gray-500' />
		}
	}

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'To Do':
				return 'bg-gray-100 text-gray-800'
			case 'In Progress':
				return 'bg-blue-100 text-blue-800'
			case 'Review':
				return 'bg-yellow-100 text-yellow-800'
			case 'Done':
				return 'bg-green-100 text-green-800'
			default:
				return 'bg-gray-100 text-gray-800'
		}
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('ru-RU', {
			day: 'numeric',
			month: 'short',
		})
	}

	if (loading) {
		return (
			<AuthenticatedLayout>
				<div className='p-6'>
					<div className='flex items-center justify-center h-64'>
						<div className='text-center'>
							<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto'></div>
							<p className='mt-2 text-gray-600'>Загрузка задач...</p>
						</div>
					</div>
				</div>
			</AuthenticatedLayout>
		)
	}

	return (
		<AuthenticatedLayout>
			<div className='min-h-screen bg-gray-50 p-6'>
				{error && <div className='mb-4 text-red-500'>{error}</div>}
				{/* Header */}
				<div className='flex items-center justify-between mb-6'>
					<div>
						<h1 className='text-3xl font-bold text-gray-900'>Задачи</h1>
						<p className='text-gray-600'>Управление проектными задачами</p>
					</div>
					<div className='flex items-center gap-3'>
						{/* View Toggle */}
						<div className='flex bg-gray-100 rounded-lg p-1'>
							<Button
								variant={viewMode === 'kanban' ? 'default' : 'ghost'}
								size='sm'
								onClick={() => setViewMode('kanban')}
								className='flex items-center gap-2'
							>
								<LayoutGrid className='h-4 w-4' />
								Канбан
							</Button>
							<Button
								variant={viewMode === 'table' ? 'default' : 'ghost'}
								size='sm'
								onClick={() => setViewMode('table')}
								className='flex items-center gap-2'
							>
								<List className='h-4 w-4' />
								Таблица
							</Button>
						</div>
						<Button
							onClick={() => setShowNewTaskForm(true)}
							className='flex items-center gap-2'
						>
							<Plus className='h-4 w-4' />
							Новая задача
						</Button>
					</div>
				</div>
				{/* Stats */}
				<div className='grid grid-cols-4 gap-4 mb-6'>
					{columns.map(column => (
						<Card key={column.id}>
							<CardContent className='p-4'>
								<div className='text-2xl font-bold text-gray-900'>
									{column.tasks.length}
								</div>
								<div className='text-sm text-gray-600'>{column.title}</div>
							</CardContent>
						</Card>
					))}
				</div>
				{/* Filters and Search (for table view) */}
				{viewMode === 'table' && (
					<Card className='mb-6'>
						<CardContent className='p-4'>
							<div className='flex items-center gap-4'>
								<div className='flex-1'>
									<div className='relative'>
										<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
										<Input
											placeholder='Поиск задач...'
											value={searchTerm}
											onChange={e => setSearchTerm(e.target.value)}
											className='pl-10'
										/>
									</div>
								</div>
								<Select value={statusFilter} onValueChange={setStatusFilter}>
									<SelectTrigger className='w-48'>
										<SelectValue placeholder='Статус' />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='all'>Все статусы</SelectItem>
										<SelectItem value='To Do'>К выполнению</SelectItem>
										<SelectItem value='In Progress'>В работе</SelectItem>
										<SelectItem value='Review'>На проверке</SelectItem>
										<SelectItem value='Done'>Завершено</SelectItem>
									</SelectContent>
								</Select>
								<Select
									value={priorityFilter}
									onValueChange={setPriorityFilter}
								>
									<SelectTrigger className='w-48'>
										<SelectValue placeholder='Приоритет' />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='all'>Все приоритеты</SelectItem>
										<SelectItem value='Low'>Низкий</SelectItem>
										<SelectItem value='Medium'>Средний</SelectItem>
										<SelectItem value='High'>Высокий</SelectItem>
										<SelectItem value='Critical'>Критический</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</CardContent>
					</Card>
				)}
				{/* New Task Form */}
				{showNewTaskForm && (
					<Card className='mb-6'>
						<CardHeader>
							<CardTitle>Новая задача</CardTitle>
						</CardHeader>
						<CardContent className='space-y-4'>
							<Input
								placeholder='Название задачи'
								value={newTask.title}
								onChange={e =>
									setNewTask({ ...newTask, title: e.target.value })
								}
							/>
							<Textarea
								placeholder='Описание (необязательно)'
								value={newTask.description}
								onChange={e =>
									setNewTask({ ...newTask, description: e.target.value })
								}
							/>
							<div className='flex gap-4'>
								<Select
									value={newTask.priority}
									onValueChange={(value: Task['priority']) =>
										setNewTask({ ...newTask, priority: value })
									}
								>
									<SelectTrigger className='w-48'>
										<SelectValue placeholder='Приоритет' />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='Low'>Низкий</SelectItem>
										<SelectItem value='Medium'>Средний</SelectItem>
										<SelectItem value='High'>Высокий</SelectItem>
										<SelectItem value='Critical'>Критический</SelectItem>
									</SelectContent>
								</Select>
								<Input
									placeholder='Исполнитель'
									value={newTask.assignedTo}
									onChange={e =>
										setNewTask({ ...newTask, assignedTo: e.target.value })
									}
								/>
								<Input
									type='date'
									value={newTask.dueDate}
									onChange={e =>
										setNewTask({ ...newTask, dueDate: e.target.value })
									}
								/>
							</div>
							<Input
								placeholder='Linked to (e.g., contact:123)'
								value={newTask.linkedTo}
								onChange={e =>
									setNewTask({ ...newTask, linkedTo: e.target.value })
								}
							/>
							<div className='flex gap-2'>
								<Button onClick={addNewTask}>Создать</Button>
								<Button
									variant='outline'
									onClick={() => setShowNewTaskForm(false)}
								>
									Отмена
								</Button>
							</div>
						</CardContent>
					</Card>
				)}
				{/* Table View */}
				{viewMode === 'table' && (
					<Card>
						<div className='overflow-x-auto'>
							<table className='w-full'>
								<thead className='bg-gray-50'>
									<tr>
										<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
											Задача
										</th>
										<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
											Статус
										</th>
										<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
											Приоритет
										</th>
										<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
											Исполнитель
										</th>
										<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
											Срок
										</th>
										<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
											Создано
										</th>
										<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
											Действия
										</th>
									</tr>
								</thead>
								<tbody className='bg-white divide-y divide-gray-200'>
									{getFilteredTasks().map(task => (
										<tr key={task.id} className='hover:bg-gray-50'>
											<td className='px-6 py-4'>
												<div>
													<div className='text-sm font-medium text-gray-900'>
														{task.title}
													</div>
													{task.description && (
														<div className='text-sm text-gray-500 mt-1'>
															{task.description}
														</div>
													)}
													{task.linkedTo && (
														<div className='text-sm text-gray-500 mt-1'>
															Linked: {task.linkedTo}
														</div>
													)}
												</div>
											</td>
											<td className='px-6 py-4'>
												<Select
													value={task.status}
													onValueChange={value =>
														updateTaskStatus(task.id, value)
													}
												>
													<SelectTrigger className='w-32'>
														<Badge className={getStatusColor(task.status)}>
															{task.status}
														</Badge>
													</SelectTrigger>
													<SelectContent>
														<SelectItem value='To Do'>К выполнению</SelectItem>
														<SelectItem value='In Progress'>
															В работе
														</SelectItem>
														<SelectItem value='Review'>На проверке</SelectItem>
														<SelectItem value='Done'>Завершено</SelectItem>
													</SelectContent>
												</Select>
											</td>
											<td className='px-6 py-4'>
												<div className='flex items-center gap-2'>
													{getPriorityIcon(task.priority)}
													<span className='text-sm font-medium'>
														{task.priority}
													</span>
												</div>
											</td>
											<td className='px-6 py-4'>
												{task.assignedTo && (
													<div className='flex items-center gap-2'>
														<User className='h-4 w-4 text-gray-400' />
														<span className='text-sm text-gray-900'>
															{task.assignedTo}
														</span>
													</div>
												)}
											</td>
											<td className='px-6 py-4'>
												{task.dueDate && (
													<div className='flex items-center gap-2 text-sm text-gray-600'>
														<Calendar className='h-4 w-4' />
														{formatDate(task.dueDate)}
													</div>
												)}
											</td>
											<td className='px-6 py-4'>
												<div className='flex items-center gap-2 text-sm text-gray-600'>
													<Clock className='h-4 w-4' />
													{formatDate(task.createdAt)}
												</div>
											</td>
											<td className='px-6 py-4'>
												<Button
													variant='ghost'
													size='sm'
													onClick={() => deleteTask(task.id)}
													className='text-red-500 hover:text-red-700'
												>
													<Trash2 className='h-4 w-4' />
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Card>
				)}
				{/* Kanban Board */}
				{viewMode === 'kanban' && (
					<div className='grid grid-cols-4 gap-6'>
						{columns.map(column => (
							<div key={column.id} className='space-y-4'>
								<div className={`rounded-lg p-3 ${column.color}`}>
									<h2 className='font-semibold text-gray-800'>
										{column.title}
									</h2>
									<span className='text-sm text-gray-600'>
										{column.tasks.length} задач
									</span>
								</div>
								<div
									className='min-h-[200px] space-y-3 p-2 rounded-lg border-2 border-dashed border-transparent transition-colors'
									onDragOver={handleDragOver}
									onDrop={e => handleDrop(e, column.id)}
									style={{
										borderColor:
											draggedTask && draggedFrom !== column.id
												? '#3b82f6'
												: 'transparent',
									}}
								>
									{column.tasks.map(task => (
										<Card
											key={task.id}
											draggable
											onDragStart={e => handleDragStart(e, task, column.id)}
											onDragEnd={handleDragEnd}
											className='cursor-move hover:shadow-md transition-shadow select-none'
										>
											<CardContent className='p-4'>
												<div className='flex items-start justify-between mb-2'>
													<div className='flex items-start gap-2 flex-1'>
														<GripVertical className='h-4 w-4 text-gray-400 mt-1 flex-shrink-0' />
														<h3 className='font-medium text-gray-900 flex-1'>
															{task.title}
														</h3>
													</div>
													<Button
														variant='ghost'
														size='sm'
														onClick={() => deleteTask(task.id)}
														className='text-red-500 hover:text-red-700 p-1'
													>
														<Trash2 className='h-4 w-4' />
													</Button>
												</div>
												{task.description && (
													<p className='text-sm text-gray-600 mb-3 ml-6'>
														{task.description}
													</p>
												)}
												{task.linkedTo && (
													<p className='text-sm text-gray-500 mb-3 ml-6'>
														Linked: {task.linkedTo}
													</p>
												)}
												<div className='flex items-center justify-between mb-2 ml-6'>
													<Badge
														className={`text-white ${getPriorityColor(task.priority)}`}
													>
														{task.priority}
													</Badge>
													{task.dueDate && (
														<div className='flex items-center text-xs text-gray-500'>
															<Calendar className='h-3 w-3 mr-1' />
															{formatDate(task.dueDate)}
														</div>
													)}
												</div>
												<div className='flex items-center justify-between text-xs text-gray-500 ml-6'>
													{task.assignedTo && (
														<div className='flex items-center'>
															<User className='h-3 w-3 mr-1' />
															{task.assignedTo}
														</div>
													)}
													<div className='flex items-center'>
														<Clock className='h-3 w-3 mr-1' />
														{formatDate(task.createdAt)}
													</div>
												</div>
											</CardContent>
										</Card>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</AuthenticatedLayout>
	)
}
