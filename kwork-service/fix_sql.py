#!/usr/bin/env python3
"""
Скрипт для исправления SQL placeholder'ов с ? на $1, $2, etc.
"""

import re
import os

def fix_sql_placeholders(file_path):
    """Исправляет SQL placeholder'ы в файле"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Заменяем ? на $1, $2, etc. в SQL запросах
    def replace_placeholders(match):
        sql = match.group(1)
        # Находим все ? в SQL и заменяем их на $1, $2, etc.
        count = 1
        while '?' in sql:
            sql = sql.replace('?', f'${count}', 1)
            count += 1
        return f'"{sql}"'
    
    # Ищем строки с SQL запросами
    pattern = r'"([^"]*SELECT[^"]*\?[^"]*)"'
    content = re.sub(pattern, replace_placeholders, content)
    
    pattern = r'"([^"]*INSERT[^"]*\?[^"]*)"'
    content = re.sub(pattern, replace_placeholders, content)
    
    pattern = r'"([^"]*UPDATE[^"]*\?[^"]*)"'
    content = re.sub(pattern, replace_placeholders, content)
    
    pattern = r'"([^"]*DELETE[^"]*\?[^"]*)"'
    content = re.sub(pattern, replace_placeholders, content)
    
    pattern = r'"([^"]*WHERE[^"]*\?[^"]*)"'
    content = re.sub(pattern, replace_placeholders, content)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Fixed {file_path}")

# Файлы для исправления
files_to_fix = [
    'app/api/v1/accounts.py',
    'app/api/v1/orders.py',
    'app/api/v1/chat.py',
    'app/api/v1/quark.py',
    'app/utils/file_handler.py',
    'app/services/kwork_client.py'
]

for file_path in files_to_fix:
    if os.path.exists(file_path):
        fix_sql_placeholders(file_path)
    else:
        print(f"File not found: {file_path}")

print("SQL placeholder fixing completed!") 