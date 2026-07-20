"""
Переименование ДЖАРВИС → ВАЛЛИ в видимых строках.
НЕ трогаем: имена переменных, функций, импортов, маршруты API,
             ключи объектов, TypeScript-типы.
ТРОГАЕМ: строковые литералы (содержимое JSX, комментарии, описания).
"""
import re, os

BASE = 'a:/HADJAL/Рабочий стол/asgard-redesign'

# ─── Файлы и что в них менять ──────────────────────────────────────────────

def replace_display_strings(text: str, replacements: list[tuple[str,str]]) -> str:
    for old, new in replacements:
        text = text.replace(old, new)
    return text

# ─── 1. jarvis-personality.service.ts ─────────────────────────────────────
p1 = f'{BASE}/backend/src/services/jarvis-personality.service.ts'
t = open(p1, encoding='utf-8').read()
# Только строки-тексты внутри массивов и заголовок
t = t.replace('Твой близнец — это ты, но без лени.» — ДЖАРВИС', 'Твой близнец — это ты, но без лени.» — ВАЛЛИ')
t = t.replace('JARVIS · Personality Service', 'ВАЛЛИ · Personality Service')
t = t.replace('Личность ДЖАРВИСА:', 'Личность ВАЛЛИ:')
t = t.replace('ответ ДЖАРВИСА', 'ответ ВАЛЛИ')
open(p1, 'w', encoding='utf-8').write(t)
print('✓ jarvis-personality.service.ts')

# ─── 2. JarvisAvatar.tsx — меняем комментарии ─────────────────────────────
p2 = f'{BASE}/components/JarvisAvatar.tsx'
t = open(p2, encoding='utf-8').read()
t = t.replace('OSGARD · JARVIS 3D Avatar', 'OSGARD · ВАЛЛИ 3D Avatar')
t = t.replace('3D-аватар ДЖАРВИСА', '3D-аватар ВАЛЛИ')
open(p2, 'w', encoding='utf-8').write(t)
print('✓ JarvisAvatar.tsx')

# ─── 3. JarvisChat.tsx — UI-строки ────────────────────────────────────────
p3 = f'{BASE}/components/JarvisChat.tsx'
t = open(p3, encoding='utf-8').read()

# Заголовки/подписи в JSX (строки в кавычках внутри JSX-текста)
ui_replacements = [
    ('OSGARD · JARVIS Chat Widget', 'OSGARD · ВАЛЛИ Chat Widget'),
    ('Чат с ИИ-ассистентом ДЖАРВИС.', 'Чат с ИИ-ассистентом ВАЛЛИ.'),
    ('"ДЖАРВИС"', '"ВАЛЛИ"'),
    ('ДЖАРВИС', 'ВАЛЛИ'),
    ('Jarvis', 'ВАЛЛИ'),
    # Не трогаем импорт JarvisAvatar — только текстовые строки
]
for old, new in ui_replacements:
    t = t.replace(old, new)

# Восстановить испорченные импорты если что
t = t.replace("import ВАЛЛИAvatar", "import JarvisAvatar")
t = t.replace("import ВАЛЛИEquipment", "import JarvisEquipment")
t = t.replace("import type { ВАЛЛИEquipment", "import type { JarvisEquipment")
t = t.replace("from \"@/lib/вАЛЛИ-equipment\"", "from \"@/lib/jarvis-equipment\"")
t = t.replace("from \"@/components/ВАЛЛИAvatar\"", "from \"@/components/JarvisAvatar\"")
t = t.replace("ВАЛЛИEquipment", "JarvisEquipment")
t = t.replace("вАЛЛИ-equipment", "jarvis-equipment")
open(p3, 'w', encoding='utf-8').write(t)
print('✓ JarvisChat.tsx')

# ─── 4. lib/jarvis-equipment.ts — описания скинов ─────────────────────────
p4 = f'{BASE}/lib/jarvis-equipment.ts'
t = open(p4, encoding='utf-8').read()
# Только строки описаний (description/name поля) — не имена типов
desc_replacements = [
    ('"ДЖАРВИС"', '"ВАЛЛИ"'),
    ('ДЖАРВИС', 'ВАЛЛИ'),
    ('для Джарвиса', 'для ВАЛЛИ'),
    ('Джарвис', 'ВАЛЛИ'),
]
for old, new in desc_replacements:
    t = t.replace(old, new)
# Исправить если сломало TypeScript-имена
t = t.replace("type ВАЛЛИEquipment", "type JarvisEquipment")
t = t.replace("interface ВАЛЛИEquipment", "interface JarvisEquipment")
t = t.replace("export type ВАЛЛИEquipment", "export type JarvisEquipment")
t = t.replace("ВАЛЛИEquipment", "JarvisEquipment")
open(p4, 'w', encoding='utf-8').write(t)
print('✓ lib/jarvis-equipment.ts')

# ─── 5. app/jarvis/shop/page.tsx — заголовки и описания ───────────────────
p5 = f'{BASE}/app/jarvis/shop/page.tsx'
t = open(p5, encoding='utf-8').read()
shop_replacements = [
    ('ДЖАРВИС', 'ВАЛЛИ'),
    ('Джарвис', 'ВАЛЛИ'),
    ('JARVIS', 'ВАЛЛИ'),
    ('Jarvis Shop', 'Магазин ВАЛЛИ'),
    ('для Джарвиса', 'для ВАЛЛИ'),
]
for old, new in shop_replacements:
    t = t.replace(old, new)
# Не трогаем api paths /api/jarvis/...
import re
t = re.sub(r'(?<!api/)(?<!/)(?<!")ВАЛЛИ(?=\.routes)', 'jarvis', t)
# Восстановить API пути которые могли сломаться
t = t.replace('/api/ВАЛЛИ/', '/api/jarvis/')
t = t.replace('"/api/ВАЛЛИ', '"/api/jarvis')
t = t.replace("'/api/ВАЛЛИ", "'/api/jarvis")
open(p5, 'w', encoding='utf-8').write(t)
print('✓ app/jarvis/shop/page.tsx')

# ─── 6. backend/src/services/jarvis.service.ts — системный промпт ─────────
p6 = f'{BASE}/backend/src/services/jarvis.service.ts'
t = open(p6, encoding='utf-8').read()
svc_replacements = [
    ('Ты — ДЖАРВИС', 'Ты — ВАЛЛИ'),
    ('Ты — Jarvis', 'Ты — ВАЛЛИ'),
    ('You are JARVIS', 'You are ВАЛЛИ'),
    ('ДЖАРВИС', 'ВАЛЛИ'),
    ('ИИ-ассистент ДЖАРВИС', 'ИИ-ассистент ВАЛЛИ'),
    # Не трогаем имена функций/переменных
]
for old, new in svc_replacements:
    t = t.replace(old, new)
open(p6, 'w', encoding='utf-8').write(t)
print('✓ jarvis.service.ts')

# ─── 7. navbar.tsx — если там есть "ДЖАРВИС" в UI ─────────────────────────
p7 = f'{BASE}/components/navbar.tsx'
t = open(p7, encoding='utf-8').read()
if 'ДЖАРВИС' in t or 'Jarvis' in t:
    t = t.replace('ДЖАРВИС', 'ВАЛЛИ')
    t = t.replace('>Jarvis<', '>ВАЛЛИ<')
    t = t.replace('"Jarvis"', '"ВАЛЛИ"')
    open(p7, 'w', encoding='utf-8').write(t)
    print('✓ navbar.tsx')
else:
    print('- navbar.tsx: нет изменений')

print('\nВсё готово!')
