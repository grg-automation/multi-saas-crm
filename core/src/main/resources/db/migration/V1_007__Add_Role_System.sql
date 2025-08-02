-- Добавляем поле role в таблицу пользователей
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'MANAGER';

-- Обновляем существующих superuser'ов до роли ADMIN
UPDATE users SET role = 'ADMIN' WHERE is_superuser = true;

-- Создаем таблицу назначений чатов
CREATE TABLE chat_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id VARCHAR(255) NOT NULL,
    manager_id UUID NOT NULL,
    assigned_by UUID NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_chat_assignments_manager FOREIGN KEY (manager_id) REFERENCES users(id),
    CONSTRAINT fk_chat_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id)
);

-- Создаем индексы для производительности
CREATE INDEX idx_chat_assignments_thread_id ON chat_assignments(thread_id);
CREATE INDEX idx_chat_assignments_manager_id ON chat_assignments(manager_id);
CREATE INDEX idx_chat_assignments_active ON chat_assignments(is_active);

-- Создаем таблицу анонимизированных контактов
CREATE TABLE contact_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id VARCHAR(255) UNIQUE NOT NULL,
    alias_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uk_contact_aliases_thread_id UNIQUE (thread_id)
);

-- Создаем индекс для поиска по thread_id
CREATE INDEX idx_contact_aliases_thread_id ON contact_aliases(thread_id);

-- Комментарии к таблицам
COMMENT ON TABLE chat_assignments IS 'Назначения чатов менеджерам для обработки';
COMMENT ON TABLE contact_aliases IS 'Анонимизированные имена контактов для менеджеров';

-- Комментарии к полям
COMMENT ON COLUMN users.role IS 'Роль пользователя: ADMIN или MANAGER';
COMMENT ON COLUMN chat_assignments.thread_id IS 'ID треда/чата из системы messaging';
COMMENT ON COLUMN chat_assignments.manager_id IS 'ID менеджера, которому назначен чат';
COMMENT ON COLUMN chat_assignments.assigned_by IS 'ID администратора, который назначил чат';
COMMENT ON COLUMN chat_assignments.is_active IS 'Активно ли назначение (для soft delete)';
COMMENT ON COLUMN contact_aliases.alias_name IS 'Анонимизированное имя контакта (Контакт #1, #2, etc.)';