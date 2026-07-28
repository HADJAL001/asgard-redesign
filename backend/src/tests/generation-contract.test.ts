import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveExportContract,
  renderExportContract,
  verifyAgainstContract,
  reconcileWithContract,
} from '../lib/generation-contract';
import { explainBuildIntegrity, type SourceFile } from '../lib/build-integrity';

/* ================================================================
   OSGARD · Контракт экспортов генерации (lib/generation-contract).

   Смысл модуля. Файлы приложения генерируются ПАРАЛЛЕЛЬНО и не видят
   друг друга. В промпт подставлялся список «путь: назначение» — без
   экспортов, поэтому каждый файл УГАДЫВАЛ форму импорта соседа. На
   живом тесте это дало 18 ошибок импортов в одном приложении.

   Здесь воспроизведены ровно те формы промахов и проверено, что после
   контракта + сверки ошибок импортов НОЛЬ. Тесты офлайновые: контракт
   выводится кодом, AI-ключи не нужны — это и есть доказательство, что
   вторая фаза не стоит ни одного дополнительного вызова модели.
   ================================================================ */

const PACKAGE_JSON: SourceFile = {
  path: 'package.json',
  content: JSON.stringify({
    name: 'app',
    dependencies: { next: '^14.2.0', react: '^18.3.0', 'react-dom': '^18.3.0' },
  }),
};

const MANIFEST = [
  'app/page.tsx',
  'components/Hero.tsx',
  'components/Card.tsx',
  'hooks/useCart.ts',
  'lib/format.ts',
];

/* ----------------------------------------------------------------
   Вывод контракта
   ---------------------------------------------------------------- */

test('контракт выводится из путей детерминированно, без AI', () => {
  const contract = deriveExportContract(MANIFEST);

  const hero = contract.byPath.get('components/Hero.tsx');
  assert.ok(hero, 'компонент обязан попасть в контракт');
  assert.equal(hero!.symbol, 'Hero');
  // Двойной экспорт: любая форма импорта соседа окажется верной.
  assert.equal(hero!.requiresDefault, true);
  assert.equal(hero!.requiresNamed, true);

  const page = contract.byPath.get('app/page.tsx');
  assert.equal(page!.requiresDefault, true, 'маршрут App Router обязан отдавать default');
  assert.equal(page!.requiresNamed, false, 'у страницы именованный экспорт не требуется');

  const hook = contract.byPath.get('hooks/useCart.ts');
  assert.equal(hook!.symbol, 'useCart', 'имя хука приводится к форме useXxx');
  assert.equal(hook!.requiresDefault, false, 'у хука default не осмыслен');
  assert.equal(hook!.requiresNamed, true);

  const lib = contract.byPath.get('lib/format.ts');
  assert.equal(lib!.requiresDefault, false);
  assert.equal(lib!.requiresNamed, true);
});

test('контракт для промпта содержит готовую строку импорта, а не только путь', () => {
  const contract = deriveExportContract(MANIFEST);
  const purposes = new Map([['components/Hero.tsx', 'Шапка страницы']]);
  const rendered = renderExportContract(contract, purposes, 'app/page.tsx');

  assert.match(rendered, /import Hero from "@\/components\/Hero"/, 'форма импорта задана дословно');
  assert.match(rendered, /import \{ useCart \} from "@\/hooks\/useCart"/);
  assert.match(rendered, /Шапка страницы/, 'назначение файла сохранено');
  assert.doesNotMatch(rendered, /app\/page\.tsx —/, 'сам себя файл импортировать не предлагает');
  assert.match(rendered, /ОБЯЗАН экспортировать/, 'файл знает и свои обязательства');
});

/* ----------------------------------------------------------------
   Сверка ловит ровно те промахи, что дали 18 ошибок
   ---------------------------------------------------------------- */

test('ловит default-импорт файла, который отдаёт только именованный', () => {
  const contract = deriveExportContract(['app/page.tsx', 'lib/format.ts']);
  const files: SourceFile[] = [
    { path: 'app/page.tsx', content: `import format from "@/lib/format"\n\nexport default function Page() {\n  return <div>{format(1)}</div>\n}\n` },
    { path: 'lib/format.ts', content: `export function format(n: number) {\n  return String(n)\n}\n` },
  ];

  const violations = verifyAgainstContract(files, contract);
  assert.ok(
    violations.some((v) => v.kind === 'wrong-import-form' && v.file === 'app/page.tsx'),
    'default из файла без default обязан быть нарушением',
  );
});

test('ловит импорт файла, которого нет в манифесте (@/utils/cn)', () => {
  const contract = deriveExportContract(['app/page.tsx']);
  const files: SourceFile[] = [
    { path: 'app/page.tsx', content: `import { cn } from "@/utils/cn"\n\nexport default function Page() {\n  return <div className={cn("a")} />\n}\n` },
  ];

  const violations = verifyAgainstContract(files, contract);
  assert.ok(
    violations.some((v) => v.kind === 'unknown-import'),
    'импорт несуществующего модуля обязан быть ошибкой, а не предупреждением',
  );
});

test('ловит отсутствие обязательного экспорта по контракту', () => {
  const contract = deriveExportContract(['components/Hero.tsx']);
  const files: SourceFile[] = [
    { path: 'components/Hero.tsx', content: `export function Hero() {\n  return <h1>Hero</h1>\n}\n` },
  ];

  const violations = verifyAgainstContract(files, contract);
  assert.ok(
    violations.some((v) => v.kind === 'missing-export' && v.symbol === 'Hero'),
    'компонент без default нарушает контракт двойного экспорта',
  );
});

test('согласованный набор нарушений не даёт', () => {
  const contract = deriveExportContract(['app/page.tsx', 'components/Hero.tsx']);
  const files: SourceFile[] = [
    { path: 'app/page.tsx', content: `import Hero from "@/components/Hero"\n\nexport default function Page() {\n  return <Hero />\n}\n` },
    { path: 'components/Hero.tsx', content: `export function Hero() {\n  return <h1>Hero</h1>\n}\n\nexport default Hero\n` },
  ];

  assert.deepEqual(verifyAgainstContract(files, contract), []);
});

/* ----------------------------------------------------------------
   Досборка — детерминированная, без AI
   ---------------------------------------------------------------- */

test('досоздаёт файл, который импортируют, но которого нет', () => {
  const files: SourceFile[] = [
    { path: 'app/page.tsx', content: `import { cn } from "@/utils/cn"\n\nexport default function Page() {\n  return <div className={cn("a", "b")} />\n}\n` },
  ];
  const contract = deriveExportContract(files.map((f) => f.path));
  const result = reconcileWithContract(files, contract);

  const created = result.files.find((f) => f.path === 'utils/cn.ts');
  assert.ok(created, 'недостающий модуль обязан быть достроен по контракту');
  assert.match(created!.content, /export function cn/, 'достроенный модуль отдаёт ровно тот символ, который импортируют');
  assert.equal(result.actions.length, 1);
  assert.deepEqual(verifyAgainstContract(result.files, result.contract), [], 'после досборки расхождений нет');
});

test('дописывает недостающий default-экспорт, не трогая замысел файла', () => {
  const files: SourceFile[] = [
    { path: 'components/Hero.tsx', content: `export function Hero() {\n  return <h1>Заголовок</h1>\n}\n` },
  ];
  const contract = deriveExportContract(files.map((f) => f.path));
  const result = reconcileWithContract(files, contract);

  const hero = result.files.find((f) => f.path === 'components/Hero.tsx')!;
  assert.match(hero.content, /export default Hero/, 'default дописан');
  assert.match(hero.content, /export function Hero/, 'исходное объявление сохранено');
  assert.deepEqual(verifyAgainstContract(result.files, result.contract), []);
});

test('срезает повторное объявление символа (webpack: redefined)', () => {
  // Найдено НАСТОЯЩЕЙ сборкой на живом прогоне: модель сама дописала второй
  // `export function NotesList`, да ещё и с рекурсивным вызовом себя. Разбор графа
  // такой файл пропускает (символ экспортируется), webpack падает.
  const files: SourceFile[] = [
    {
      path: 'components/NotesList.tsx',
      content: `function NotesList() {\n  return <ul />\n}\n\nexport default NotesList;\nexport function NotesList() {\n  // Re-export for named import compatibility\n  return <NotesList />;\n}\n`,
    },
  ];
  const contract = deriveExportContract(files.map((f) => f.path));
  const result = reconcileWithContract(files, contract);

  const list = result.files.find((f) => f.path === 'components/NotesList.tsx')!;
  const declarations = [...list.content.matchAll(/(?:export\s+)?function\s+NotesList\b/g)];
  assert.equal(declarations.length, 1, 'объявление обязано остаться ровно одно');
  assert.match(list.content, /export default NotesList/, 'default сохранён');
  assert.match(list.content, /export \{ NotesList \}/, 'именованный экспорт приведён к корректной форме');
  assert.doesNotMatch(list.content, /Re-export for named import/, 'дубль срезан целиком');
});

test('срезает самоприсваивание const X = X', () => {
  // Реальный случай живого прогона: модель «реэкспортировала» компонент так.
  // Стейтмент бессмыслен (значение — он сам) и валит webpack как redefined.
  const files: SourceFile[] = [
    {
      path: 'components/SearchEmpty.tsx',
      content: `function SearchEmpty() {\n  return <div>Нет результатов</div>\n}\n\nconst SearchEmpty = SearchEmpty;\n\nexport default SearchEmpty;\n`,
    },
  ];
  const contract = deriveExportContract(files.map((f) => f.path));
  const result = reconcileWithContract(files, contract);

  const empty = result.files.find((f) => f.path === 'components/SearchEmpty.tsx')!;
  assert.doesNotMatch(empty.content, /const SearchEmpty = SearchEmpty/, 'самоприсваивание срезано');
  assert.match(empty.content, /function SearchEmpty/, 'объявление сохранено');
  assert.match(empty.content, /export default SearchEmpty/, 'default-экспорт сохранён');
});

test('переименовывает объявление, имя которого занято импортом', () => {
  // Реальный случай живого прогона: иконка Search из lucide-react и страница
  // с тем же именем в одном файле — webpack падает на "Search redefined".
  const files: SourceFile[] = [
    {
      path: 'app/search/page.tsx',
      content: `import { Search, X } from "lucide-react"\n\nexport default function Search() {\n  return (\n    <div>\n      <Search />\n      <X />\n    </div>\n  )\n}\n`,
    },
  ];
  const contract = deriveExportContract(files.map((f) => f.path));
  const result = reconcileWithContract(files, contract);

  const page = result.files.find((f) => f.path === 'app/search/page.tsx')!;
  assert.match(page.content, /import \{ Search, X \} from "lucide-react"/, 'импорт не тронут — он используется в разметке');
  assert.match(page.content, /export default function SearchPage\(/, 'объявление переименовано');
  assert.match(page.content, /<Search \/>/, 'использование иконки сохранено');
});

test('дубль в СЕРЕДИНЕ файла не срезается (не угадываем за автора)', () => {
  const files: SourceFile[] = [
    {
      path: 'components/Widget.tsx',
      content: `function Widget() {\n  return <div />\n}\n\nexport function Widget() {\n  return <span />\n}\n\nexport const helper = () => 1\n\nexport default Widget\n`,
    },
  ];
  const contract = deriveExportContract(files.map((f) => f.path));
  const result = reconcileWithContract(files, contract);

  const widget = result.files.find((f) => f.path === 'components/Widget.tsx')!;
  assert.match(widget.content, /export const helper/, 'код после дубля обязан остаться нетронутым');
});

test('распространяет "use client" по графу импортов', () => {
  // Реальный случай из живого прогона: useHabits клиентский, useStats импортирует
  // его и сам зовёт хук, но директивы не имеет — next build падает.
  const files: SourceFile[] = [
    { path: 'hooks/useHabits.ts', content: `"use client"\n\nimport { useState } from "react"\n\nexport function useHabits() {\n  return useState(0)\n}\n` },
    { path: 'hooks/useStats.ts', content: `import { useMemo } from "react"\nimport { useHabits } from "@/hooks/useHabits"\n\nexport function useStats() {\n  const h = useHabits()\n  return useMemo(() => h, [h])\n}\n` },
  ];
  const contract = deriveExportContract(files.map((f) => f.path));
  const result = reconcileWithContract(files, contract);

  const stats = result.files.find((f) => f.path === 'hooks/useStats.ts')!;
  assert.match(stats.content, /^"use client"/, 'потребитель клиентского модуля обязан стать клиентским');
  assert.match(stats.content, /export function useStats/, 'содержимое файла сохранено');
});

test('страницу с metadata клиентской НЕ делает', () => {
  // "use client" + export const metadata — несовместимы; такой случай обязан
  // остаться инженерному контуру (нужен разрез компонента), а не «чиниться» вслепую.
  const files: SourceFile[] = [
    { path: 'components/Widget.tsx', content: `"use client"\n\nexport function Widget() {\n  return <div />\n}\n\nexport default Widget\n` },
    { path: 'app/page.tsx', content: `import Widget from "@/components/Widget"\n\nexport const metadata = { title: "X" }\n\nexport default function Page() {\n  return <Widget />\n}\n` },
  ];
  const contract = deriveExportContract(files.map((f) => f.path));
  const result = reconcileWithContract(files, contract);

  const page = result.files.find((f) => f.path === 'app/page.tsx')!;
  assert.doesNotMatch(page.content, /^"use client"/, 'страница с metadata не должна получать директиву');
});

/* ----------------------------------------------------------------
   Сквозная проверка: то, что раньше давало ошибки импортов, даёт ноль
   ---------------------------------------------------------------- */

test('сквозь: набор с промахами всех трёх видов после сверки даёт НОЛЬ ошибок импортов', () => {
  // Ровно те формы промахов, что наблюдались на живом тесте.
  const broken: SourceFile[] = [
    PACKAGE_JSON,
    {
      path: 'app/page.tsx',
      content: `import Hero from "@/components/Hero"
import { Card } from "@/components/Card"
import { cn } from "@/utils/cn"

export default function Page() {
  return (
    <main className={cn("p-4")}>
      <Hero />
      <Card />
    </main>
  )
}
`,
    },
    // промах 1: импортируется как default, а отдаёт только именованный
    { path: 'components/Hero.tsx', content: `export function Hero() {\n  return <h1>Hero</h1>\n}\n` },
    // промах 2: импортируется как именованный, а отдаёт только default
    { path: 'components/Card.tsx', content: `export default function Card() {\n  return <div>Card</div>\n}\n` },
    // промах 3: @/utils/cn не существует вовсе
  ];

  const importRules = new Set(['import-missing', 'named-import-missing', 'default-export-missing', 'dependency-missing']);

  const before = explainBuildIntegrity(broken).defects.filter(
    (d) => d.severity === 'error' && importRules.has(d.rule),
  );
  assert.ok(before.length >= 3, `исходный набор обязан быть битым, найдено ${before.length}`);

  const contract = deriveExportContract(broken.filter((f) => /\.tsx?$/.test(f.path)).map((f) => f.path));
  const fixed = reconcileWithContract(broken, contract);

  const after = explainBuildIntegrity(fixed.files).defects.filter(
    (d) => d.severity === 'error' && importRules.has(d.rule),
  );
  assert.equal(
    after.length,
    0,
    `после сверки ошибок импортов должно быть 0, осталось ${after.length}: ${after.map((d) => `${d.file}: ${d.message}`).join('; ')}`,
  );
});
