import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propsContractDefects, repairPropValue } from '../lib/props-contract';
import { explainBuildIntegrity, repairIntegrity, type SourceFile } from '../lib/build-integrity';
import { hasLessonText } from '../lib/craft-corpus';

/* ================================================================
   OSGARD · Контракт ТИПОВ ПРОПОВ (lib/props-contract), волна 3.

   Смысл модуля. Волна 1 согласовала между параллельно сгенерированными
   файлами ФОРМУ импорта, но не то, ЧТО принимает импортированный
   компонент. Реальный дефект живого прогона:

       EmptyState  →  { icon?: LucideIcon }
       NotesEmpty  →  <EmptyState icon={<FileText />} />

   компонент ждёт ссылку на компонент, сосед передаёт отрисованный
   элемент → prerender падает. Обычный tsc это ловит, но каркас глушит
   его через `ignoreBuildErrors` (иначе пользователь не получал бы
   приложение вообще), а в проде нет Docker — то есть не ловит НИКТО.

   Половина тестов ниже — про ТИШИНУ. Модуль работает без type-checker'а
   (в проде нет node_modules приложения), поэтому ложное срабатывание
   дороже пропущенного дефекта: оно отправляет исправный файл в
   AI-ремонт и жжёт бюджет раунда. Каждое «молчит» здесь — граница
   консервативности, а не забытая проверка.
   ================================================================ */

const EMPTY_STATE: SourceFile = {
  path: 'components/EmptyState.tsx',
  content: `import type { LucideIcon } from "lucide-react"

export function EmptyState({ icon, title }: { icon?: LucideIcon; title: string }) {
  const Icon = icon
  return (
    <div>
      {Icon ? <Icon /> : null}
      <p>{title}</p>
    </div>
  )
}

export default EmptyState
`,
};

function consumer(body: string): SourceFile {
  return {
    path: 'components/NotesEmpty.tsx',
    content: `import { FileText } from "lucide-react"
import EmptyState from "@/components/EmptyState"

export function NotesEmpty() {
  return ${body}
}

export default NotesEmpty
`,
  };
}

/* ----------------------------------------------------------------
   Тот самый дефект: ждут компонент — передали элемент
   ---------------------------------------------------------------- */

test('элемент вместо компонента: дефект найден и помечен автопочинимым', () => {
  const defects = propsContractDefects([EMPTY_STATE, consumer('<EmptyState icon={<FileText />} title="Пусто" />')]);

  const mismatch = defects.filter((d) => d.rule === 'prop-type-mismatch');
  assert.equal(mismatch.length, 1, `ожидался ровно один дефект, получено: ${JSON.stringify(defects)}`);
  assert.equal(mismatch[0].file, 'components/NotesEmpty.tsx', 'чинить надо потребителя, а не объявление');
  assert.equal(mismatch[0].autoFixable, true);
  assert.equal(mismatch[0].hint?.mode, 'unwrap');
  assert.equal(mismatch[0].hint?.referenced, 'FileText');
  assert.match(mismatch[0].message, /icon=\{FileText\}/, 'сообщение обязано показывать правильную форму');
});

test('дефект пропов доходит до отчёта целостности и роняет ok', () => {
  const report = explainBuildIntegrity([EMPTY_STATE, consumer('<EmptyState icon={<FileText />} title="Пусто" />')]);

  assert.equal(report.analyzed, true);
  assert.equal(report.ok, false, 'рассогласование пропов — ошибка сборки, а не предупреждение');
  const check = report.checks.find((c) => c.key === 'props');
  assert.ok(check, 'в отчёте обязана быть проверка пропов');
  assert.equal(check.passed, false);
});

test('механический ремонт снимает лишний JSX и делает отчёт чистым', () => {
  const files = [EMPTY_STATE, consumer('<EmptyState icon={<FileText />} title="Пусто" />')];
  const report = explainBuildIntegrity(files);
  const repaired = repairIntegrity(files, report);

  const fixed = repaired.files.find((f) => f.path === 'components/NotesEmpty.tsx');
  assert.ok(fixed);
  assert.match(fixed.content, /icon=\{FileText\}/, 'проп обязан получить сам компонент');
  assert.doesNotMatch(fixed.content, /icon=\{<FileText \/>\}/);
  assert.ok(
    repaired.actions.some((a) => a.rule === 'prop-type-mismatch'),
    'ремонт обязан попасть в журнал — пользователь видит, что платформа починила',
  );

  const after = explainBuildIntegrity(repaired.files);
  assert.equal(
    after.defects.filter((d) => d.rule === 'prop-type-mismatch').length,
    0,
    'после ремонта дефект обязан исчезнуть, иначе контур зациклится',
  );
});

test('ремонт идемпотентен: повторный проход ничего не меняет', () => {
  const hint = { tag: 'EmptyState', prop: 'icon', mode: 'unwrap', referenced: 'FileText' };
  const once = repairPropValue(consumer('<EmptyState icon={<FileText />} title="Пусто" />').content, hint);
  const twice = repairPropValue(once, hint);
  assert.equal(twice, once);
});

test('ремонт правит нужный элемент, а не одноимённый проп соседнего', () => {
  const other: SourceFile = {
    path: 'components/Header.tsx',
    content: `import type { ReactNode } from "react"

export function Header({ icon }: { icon?: ReactNode }) {
  return <header>{icon}</header>
}

export default Header
`,
  };
  const both: SourceFile = {
    path: 'components/NotesEmpty.tsx',
    content: `import { FileText } from "lucide-react"
import EmptyState from "@/components/EmptyState"
import Header from "@/components/Header"

export function NotesEmpty() {
  return (
    <div>
      <Header icon={<FileText />} />
      <EmptyState icon={<FileText />} title="Пусто" />
    </div>
  )
}

export default NotesEmpty
`,
  };

  const files = [EMPTY_STATE, other, both];
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  const fixed = repaired.files.find((f) => f.path === 'components/NotesEmpty.tsx');
  assert.ok(fixed);
  assert.match(fixed.content, /<Header icon=\{<FileText \/>\} \/>/, 'Header ждёт разметку — его проп трогать нельзя');
  assert.match(fixed.content, /<EmptyState icon=\{FileText\}/, 'а EmptyState ждёт компонент — вот его и правим');
});

/* ----------------------------------------------------------------
   Зеркальный дефект: ждут разметку — передали ссылку
   ---------------------------------------------------------------- */

test('ссылка вместо разметки: дефект найден и починен обёрткой', () => {
  const banner: SourceFile = {
    path: 'components/Banner.tsx',
    content: `import type { ReactNode } from "react"

export function Banner({ slot }: { slot: ReactNode }) {
  return <div>{slot}</div>
}

export default Banner
`,
  };
  const user: SourceFile = {
    path: 'components/Home.tsx',
    content: `import { FileText } from "lucide-react"
import Banner from "@/components/Banner"

export function Home() {
  return <Banner slot={FileText} />
}

export default Home
`,
  };

  const defects = propsContractDefects([banner, user]);
  const mismatch = defects.filter((d) => d.rule === 'prop-type-mismatch');
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].hint?.mode, 'wrap');

  const files = [banner, user];
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  const fixed = repaired.files.find((f) => f.path === 'components/Home.tsx');
  assert.ok(fixed);
  assert.match(fixed.content, /slot=\{<FileText \/>\}/);
});

/* ----------------------------------------------------------------
   Обязательные и лишние пропы
   ---------------------------------------------------------------- */

test('обязательный проп не передан — дефект; необязательный — тишина', () => {
  const missing = propsContractDefects([EMPTY_STATE, consumer('<EmptyState icon={FileText} />')]);
  const required = missing.filter((d) => d.rule === 'prop-required-missing');
  assert.equal(required.length, 1, 'title объявлен без "?" — его отсутствие ломает сборку');
  assert.match(required[0].message, /title/);

  // icon необязателен — о нём молчим
  assert.equal(
    propsContractDefects([EMPTY_STATE, consumer('<EmptyState title="Пусто" />')]).length,
    0,
    'необязательный проп можно не передавать',
  );
});

test('значение по умолчанию в деструктуризации делает проп необязательным', () => {
  const badge: SourceFile = {
    path: 'components/Badge.tsx',
    content: `export function Badge({ size = "md", label }: { size: string; label: string }) {
  return <span className={size}>{label}</span>
}

export default Badge
`,
  };
  const user: SourceFile = {
    path: 'components/List.tsx',
    content: `import Badge from "@/components/Badge"

export function List() {
  return <Badge label="Готово" />
}

export default List
`,
  };
  assert.equal(
    propsContractDefects([badge, user]).length,
    0,
    'size объявлен обязательным, но имеет default — передавать его не нужно',
  );
});

test('проп, которого нет в закрытой сигнатуре — дефект', () => {
  const defects = propsContractDefects([EMPTY_STATE, consumer('<EmptyState title="Пусто" subtitle="Ой" />')]);
  const unknown = defects.filter((d) => d.rule === 'prop-unknown');
  assert.equal(unknown.length, 1);
  assert.match(unknown[0].message, /subtitle/);
});

test('interface с extends — о лишнем пропе молчим (набор шире объявленного)', () => {
  const card: SourceFile = {
    path: 'components/Card.tsx',
    content: `interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
}

export function Card({ title }: CardProps) {
  return <div>{title}</div>
}

export default Card
`,
  };
  const user: SourceFile = {
    path: 'components/Grid.tsx',
    content: `import Card from "@/components/Card"

export function Grid() {
  return <Card title="A" className="p-4" onClick={() => {}} />
}

export default Grid
`,
  };
  assert.equal(
    propsContractDefects([card, user]).filter((d) => d.rule === 'prop-unknown').length,
    0,
    'className/onClick приходят из HTMLAttributes — это не лишние пропы',
  );
});

test('{...spread} полностью выключает суждение об элементе', () => {
  const files = [
    EMPTY_STATE,
    consumer('<EmptyState {...props} icon={<FileText />} />'),
  ];
  assert.equal(propsContractDefects(files).length, 0, 'состав spread неизвестен — судить нельзя');
});

/* ----------------------------------------------------------------
   Границы: где модуль ОБЯЗАН молчать
   ---------------------------------------------------------------- */

test('компонент из внешнего пакета не сверяется с одноимённым локальным', () => {
  const localFileText: SourceFile = {
    path: 'components/FileText.tsx',
    content: `export function FileText({ label }: { label: string }) {
  return <span>{label}</span>
}

export default FileText
`,
  };
  const user: SourceFile = {
    path: 'components/Note.tsx',
    content: `import { FileText } from "lucide-react"

export function Note() {
  return <FileText />
}

export default Note
`,
  };
  assert.equal(
    propsContractDefects([localFileText, user]).length,
    0,
    'FileText здесь импортирован из lucide-react — сверять его с локальной сигнатурой нельзя',
  );
});

test('одноимённые компоненты в двух файлах — вывод неоднозначен, молчим', () => {
  const a: SourceFile = {
    path: 'components/Row.tsx',
    content: `export function Row({ title }: { title: string }) {
  return <div>{title}</div>
}

export default Row
`,
  };
  const b: SourceFile = {
    path: 'components/table/Row.tsx',
    content: `export function Row({ label }: { label: string }) {
  return <div>{label}</div>
}

export default Row
`,
  };
  const user: SourceFile = {
    path: 'components/Table.tsx',
    content: `import Row from "@/components/Row"

export function Table() {
  return <Row title="A" />
}

export default Table
`,
  };
  assert.equal(propsContractDefects([a, b, user]).length, 0, 'два объявления одного имени — судить нельзя');
});

test('children: самозакрывающийся элемент — дефект, с содержимым — тишина', () => {
  const shell: SourceFile = {
    path: 'components/Shell.tsx',
    content: `import type { ReactNode } from "react"

export function Shell({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}

export default Shell
`,
  };
  const selfClosing: SourceFile = {
    path: 'app/page.tsx',
    content: `import Shell from "@/components/Shell"

export default function Page() {
  return <Shell />
}
`,
  };
  const withChildren: SourceFile = {
    path: 'app/page.tsx',
    content: `import Shell from "@/components/Shell"

export default function Page() {
  return <Shell><p>Привет</p></Shell>
}
`,
  };

  assert.equal(
    propsContractDefects([shell, selfClosing]).filter((d) => d.rule === 'prop-required-missing').length,
    1,
    'у самозакрывающегося элемента детей нет заведомо',
  );
  assert.equal(
    propsContractDefects([shell, withChildren]).length,
    0,
    'children переданы содержимым элемента, а не атрибутом',
  );
});

test('несовместимость примитивов ловится, совместимость — нет', () => {
  const counter: SourceFile = {
    path: 'components/Counter.tsx',
    content: `export function Counter({ total, label }: { total: number; label: string }) {
  return <span>{label}: {total}</span>
}

export default Counter
`,
  };
  const bad: SourceFile = {
    path: 'components/Stats.tsx',
    content: `import Counter from "@/components/Counter"

export function Stats() {
  return <Counter total="12" label="Заметки" />
}

export default Stats
`,
  };
  const good: SourceFile = {
    path: 'components/Stats.tsx',
    content: `import Counter from "@/components/Counter"

export function Stats() {
  return <Counter total={12} label={\`Заметки\`} />
}

export default Stats
`,
  };

  const defects = propsContractDefects([counter, bad]).filter((d) => d.rule === 'prop-type-mismatch');
  assert.equal(defects.length, 1, 'строка в number-проп — реальная ошибка типов');
  assert.equal(defects[0].autoFixable, false, 'что тут имелось в виду, решает только модель');
  assert.equal(propsContractDefects([counter, good]).length, 0, 'число и шаблонная строка совместимы');
});

test('юнион строковых литералов — это строка, а не unknown', () => {
  const button: SourceFile = {
    path: 'components/Button.tsx',
    content: `export function Button({ variant, label }: { variant: "primary" | "ghost"; label: string }) {
  return <button className={variant}>{label}</button>
}

export default Button
`,
  };
  const bad: SourceFile = {
    path: 'components/Bar.tsx',
    content: `import Button from "@/components/Button"

export function Bar() {
  return <Button variant={2} label="Ок" />
}

export default Bar
`,
  };
  const good: SourceFile = {
    path: 'components/Bar.tsx',
    content: `import Button from "@/components/Button"

export function Bar() {
  return <Button variant="primary" label="Ок" />
}

export default Bar
`,
  };
  assert.equal(propsContractDefects([button, bad]).filter((d) => d.rule === 'prop-type-mismatch').length, 1);
  assert.equal(propsContractDefects([button, good]).length, 0);
});

test('обработчик события: функция — норма, строка — дефект', () => {
  const toolbar: SourceFile = {
    path: 'components/Toolbar.tsx',
    content: `export function Toolbar({ onAdd }: { onAdd: () => void }) {
  return <button onClick={onAdd}>+</button>
}

export default Toolbar
`,
  };
  const good: SourceFile = {
    path: 'components/Panel.tsx',
    content: `"use client"
import Toolbar from "@/components/Toolbar"

export function Panel() {
  return <Toolbar onAdd={() => console.log("add")} />
}

export default Panel
`,
  };
  const bad: SourceFile = {
    path: 'components/Panel.tsx',
    content: `import Toolbar from "@/components/Toolbar"

export function Panel() {
  return <Toolbar onAdd="add" />
}

export default Panel
`,
  };
  assert.equal(propsContractDefects([toolbar, good]).length, 0);
  assert.equal(propsContractDefects([toolbar, bad]).filter((d) => d.rule === 'prop-type-mismatch').length, 1);
});

test('неизвестный тип пропа не даёт дефекта ни при каком значении', () => {
  const widget: SourceFile = {
    path: 'components/Widget.tsx',
    content: `import type { Note } from "@/lib/types"

export function Widget({ note }: { note: Note }) {
  return <div>{note.title}</div>
}

export default Widget
`,
  };
  const user: SourceFile = {
    path: 'components/Wall.tsx',
    content: `import Widget from "@/components/Widget"

export function Wall() {
  return <Widget note="строка" />
}

export default Wall
`,
  };
  assert.equal(
    propsContractDefects([widget, user]).filter((d) => d.rule === 'prop-type-mismatch').length,
    0,
    'Note — внешний тип, его состав неизвестен: судить нельзя',
  );
});

test('свой же компонент в том же файле не сверяется', () => {
  const single: SourceFile = {
    path: 'app/page.tsx',
    content: `function Item({ title }: { title: string }) {
  return <li>{title}</li>
}

export default function Page() {
  return <ul><Item /></ul>
}
`,
  };
  assert.equal(propsContractDefects([single]).length, 0, 'сигнатуру своего компонента автор файла видит сам');
});

test('битый файл не роняет разбор', () => {
  const broken: SourceFile = { path: 'components/Broken.tsx', content: '{'.repeat(5000) };
  assert.doesNotThrow(() => propsContractDefects([EMPTY_STATE, broken, consumer('<EmptyState title="Ок" />')]));
});

/* ----------------------------------------------------------------
   Уроки платформы
   ---------------------------------------------------------------- */

test('каждое новое правило имеет формулировку урока', () => {
  for (const rule of ['prop-type-mismatch', 'prop-required-missing', 'prop-unknown']) {
    assert.ok(hasLessonText(rule), `правило "${rule}" копится в базе, но в промпт не попадёт — платформа учится впустую`);
  }
});
