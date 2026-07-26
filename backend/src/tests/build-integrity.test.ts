import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  explainBuildIntegrity,
  repairIntegrity,
  formatDefectsForRepair,
  filesNeedingRegeneration,
  componentNameFor,
  type SourceFile,
} from '../lib/build-integrity';

/* ================================================================
   OSGARD · Инженерная целостность (lib/build-integrity).

   Смысл модуля: до него единственной проверкой сгенерированного кода
   был ts.transpileModule — он видит ОДИН файл и только синтаксис.
   Приложение же ломается на стыках файлов, которые генерируются
   параллельно и вслепую друг к другу. Здесь проверяем, что детектор
   ловит именно эти реальные причины падения `next build`, а не
   выдуманные, и что механический ремонт восстанавливает контракт
   сборки, не переписывая смысл кода.

   Инвариант: `ok` ПРОИЗВОДЕН от списка дефектов (приём #62/#95) —
   вердикт и объяснение разойтись не могут.
   ================================================================ */

const PACKAGE_JSON: SourceFile = {
  path: 'package.json',
  content: JSON.stringify({
    name: 'app',
    dependencies: { next: '^14.2.0', react: '^18.3.0', 'react-dom': '^18.3.0' },
  }),
};

const LAYOUT: SourceFile = {
  path: 'app/layout.tsx',
  content: `import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = { title: "App", description: "Приложение" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="ru"><body>{children}</body></html>)
}
`,
};

const GLOBALS: SourceFile = { path: 'app/globals.css', content: '@tailwind base;\n' };

function withBase(...files: SourceFile[]): SourceFile[] {
  return [PACKAGE_JSON, GLOBALS, LAYOUT, ...files];
}

const CLEAN_PAGE: SourceFile = {
  path: 'app/page.tsx',
  content: `import Hero from "@/components/Hero"

export default function Page() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <Hero title="Каталог" />
    </main>
  )
}
`,
};

const CLEAN_HERO: SourceFile = {
  path: 'components/Hero.tsx',
  content: `export default function Hero({ title }: { title: string }) {
  return <h1 className="font-display text-3xl">{title}</h1>
}
`,
};

/* ---------------- чистый набор ---------------- */

test('чистое приложение проходит все проверки', () => {
  const report = explainBuildIntegrity(withBase(CLEAN_PAGE, CLEAN_HERO));
  assert.equal(report.analyzed, true);
  assert.equal(report.ok, true, `дефекты: ${JSON.stringify(report.defects)}`);
  assert.ok(report.checks.every((c) => c.passed));
});

test('инвариант: ok производен от дефектов уровня error', () => {
  const report = explainBuildIntegrity(
    withBase(CLEAN_HERO, { path: 'app/page.tsx', content: `import Ghost from "./Ghost"\nexport default function Page() { return <Ghost /> }\n` }),
  );
  assert.equal(report.ok, report.defects.every((d) => d.severity !== 'error'));
  assert.equal(report.ok, false);
});

/* ---------------- граф модулей ---------------- */

test('импорт несуществующего файла — ошибка (next build: Module not found)', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `import Hero from "@/components/Hero"\nexport default function Page() { return <Hero /> }\n`,
    }),
  );
  const defect = report.defects.find((d) => d.rule === 'import-missing');
  assert.ok(defect, 'импорт отсутствующего компонента должен быть пойман');
  assert.equal(defect!.severity, 'error');
  assert.equal(defect!.file, 'app/page.tsx');
});

test('незаявленный пакет — ошибка (установка упадёт)', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `import { motion } from "framer-motion"\nexport default function Page() { return <motion.div /> }\n`,
    }),
  );
  const defect = report.defects.find((d) => d.rule === 'dependency-missing');
  assert.ok(defect);
  assert.equal(defect!.hint?.package, 'framer-motion');
});

test('подпути объявленного пакета разрешаются (next/font/google)', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `import { Inter } from "next/font/google"\nconst font = Inter({ subsets: ["latin"] })\nexport default function Page() { return <main className={font.className}>Привет</main> }\n`,
    }),
  );
  assert.equal(report.defects.filter((d) => d.rule === 'dependency-missing').length, 0);
});

test('default-импорт из файла с одним именованным экспортом — ошибка на файле-цели', () => {
  const report = explainBuildIntegrity(
    withBase(
      { path: 'app/page.tsx', content: `import Hero from "@/components/Hero"\nexport default function Page() { return <Hero /> }\n` },
      { path: 'components/Hero.tsx', content: `export function Hero() { return <h1>Привет</h1> }\n` },
    ),
  );
  const defect = report.defects.find((d) => d.rule === 'default-export-missing');
  assert.ok(defect);
  assert.equal(defect!.file, 'components/Hero.tsx', 'чинить надо цель импорта, а не потребителя');
  assert.equal(defect!.autoFixable, true);
  assert.equal(defect!.hint?.symbol, 'Hero');
});

test('именованный импорт того, чего нет в цели — ошибка', () => {
  const report = explainBuildIntegrity(
    withBase(
      { path: 'app/page.tsx', content: `import { Card } from "@/components/Hero"\nexport default function Page() { return <Card /> }\n` },
      { path: 'components/Hero.tsx', content: `export function Hero() { return <h1>Привет</h1> }\n` },
    ),
  );
  assert.ok(report.defects.some((d) => d.rule === 'named-import-missing'));
});

test('export * from — состав экспортов неизвестен, ложных ошибок не выдумываем', () => {
  const report = explainBuildIntegrity(
    withBase(
      { path: 'app/page.tsx', content: `import { Anything } from "@/components/index"\nexport default function Page() { return <Anything /> }\n` },
      { path: 'components/index.tsx', content: `export * from "./Hero"\n` },
      { path: 'components/Hero.tsx', content: `export function Hero() { return <h1>Привет</h1> }\nexport default Hero\n` },
    ),
  );
  assert.equal(report.defects.filter((d) => d.rule === 'named-import-missing').length, 0);
});

test('type-only импорт не проверяется по составу (типы стираются)', () => {
  const report = explainBuildIntegrity(
    withBase(
      { path: 'app/page.tsx', content: `import type { Props } from "@/lib/types"\nexport default function Page() { return <main>ok</main> }\n` },
      { path: 'lib/types.ts', content: `export type Props = { title: string }\n` },
    ),
  );
  assert.equal(report.ok, true, JSON.stringify(report.defects));
});

/* ---------------- граница клиент/сервер ---------------- */

test('хук без "use client" — ошибка сборки App Router', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `import { useState } from "react"\nexport default function Page() { const [n] = useState(0); return <main>{n}</main> }\n`,
    }),
  );
  const defect = report.defects.find((d) => d.rule === 'use-client-missing');
  assert.ok(defect);
  assert.equal(defect!.autoFixable, true);
});

test('обработчик события в серверном компоненте — тоже требует директивы', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `export default function Page() { return <button type="button" onClick={() => alert("x")}>Жми</button> }\n`,
    }),
  );
  assert.ok(report.defects.some((d) => d.rule === 'use-client-missing'));
});

test('"use client" присутствует — претензий нет', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `"use client"\n\nimport { useState } from "react"\nexport default function Page() { const [n] = useState(0); return <main>{n}</main> }\n`,
    }),
  );
  assert.equal(report.defects.filter((d) => d.rule === 'use-client-missing').length, 0);
});

test('metadata + хуки — конфликт, который директивой не чинится', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `import { useState } from "react"\nexport const metadata = { title: "X" }\nexport default function Page() { const [n] = useState(0); return <main>{n}</main> }\n`,
    }),
  );
  const defect = report.defects.find((d) => d.rule === 'client-metadata-conflict');
  assert.ok(defect);
  assert.equal(defect!.autoFixable, false, 'механически чинить нельзя — нужен рефакторинг');
});

test('window на верхнем уровне модуля — падение при статическом рендере', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `const width = window.innerWidth\nexport default function Page() { return <main>{width}</main> }\n`,
    }),
  );
  assert.ok(report.defects.some((d) => d.rule === 'browser-global-toplevel'));
});

test('window внутри useEffect — легально, ложной тревоги нет', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `"use client"\n\nimport { useEffect, useState } from "react"\nexport default function Page() {\n  const [w, setW] = useState(0)\n  useEffect(() => { setW(window.innerWidth) }, [])\n  return <main>{w}</main>\n}\n`,
    }),
  );
  assert.equal(report.defects.filter((d) => d.rule === 'browser-global-toplevel').length, 0);
});

/* ---------------- контракт статического экспорта ---------------- */

test('api-роут несовместим со статическим экспортом', () => {
  const report = explainBuildIntegrity(
    withBase(CLEAN_PAGE, CLEAN_HERO, {
      path: 'app/api/items/route.ts',
      content: `export async function GET() { return Response.json([]) }\n`,
    }),
  );
  const defect = report.defects.find((d) => d.rule === 'api-route-unsupported');
  assert.ok(defect);
  assert.equal(defect!.autoFixable, true);
});

test('export const dynamic ломает статический экспорт', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: `export const dynamic = "force-dynamic"\nexport default function Page() { return <main>ok</main> }\n`,
    }),
  );
  assert.ok(report.defects.some((d) => d.rule === 'dynamic-flag-unsupported'));
});

test('динамический маршрут без generateStaticParams не экспортируется', () => {
  const report = explainBuildIntegrity(
    withBase(CLEAN_PAGE, CLEAN_HERO, {
      path: 'app/items/[id]/page.tsx',
      content: `export default function Item() { return <main>Товар</main> }\n`,
    }),
  );
  assert.ok(report.defects.some((d) => d.rule === 'dynamic-route-unexportable'));
});

test('динамический маршрут с generateStaticParams — законен', () => {
  const report = explainBuildIntegrity(
    withBase(CLEAN_PAGE, CLEAN_HERO, {
      path: 'app/items/[id]/page.tsx',
      content: `export function generateStaticParams() { return [{ id: "1" }] }\nexport default function Item() { return <main>Товар</main> }\n`,
    }),
  );
  assert.equal(report.defects.filter((d) => d.rule === 'dynamic-route-unexportable').length, 0);
});

/* ---------------- маршруты и гигиена ---------------- */

test('страница без default-экспорта — маршрута не существует', () => {
  const report = explainBuildIntegrity(
    withBase({ path: 'app/page.tsx', content: `export function Page() { return <main>ok</main> }\n` }),
  );
  const defect = report.defects.find((d) => d.rule === 'route-default-export-missing');
  assert.ok(defect);
  assert.equal(defect!.autoFixable, true);
});

test('нет главной страницы — приложения нет', () => {
  const report = explainBuildIntegrity(withBase(CLEAN_HERO));
  assert.ok(report.defects.some((d) => d.rule === 'root-page-missing'));
});

test('утёкший markdown-фенс и заглушка ловятся гигиеной', () => {
  const report = explainBuildIntegrity(
    withBase({
      path: 'app/page.tsx',
      content: '```tsx\nexport default function Page() {\n  // ... остальной код\n  return <main>ok</main>\n}\n```\n',
    }),
  );
  assert.ok(report.defects.some((d) => d.rule === 'markdown-leak'));
  assert.ok(report.defects.some((d) => d.rule === 'placeholder-code'));
});

test('пустой файл — провал генерации, а не «всё хорошо»', () => {
  const report = explainBuildIntegrity(withBase(CLEAN_PAGE, CLEAN_HERO, { path: 'components/Empty.tsx', content: '\n' }));
  assert.ok(report.defects.some((d) => d.rule === 'empty-file'));
});

test('битый package.json ловится отдельно', () => {
  const report = explainBuildIntegrity([
    { path: 'package.json', content: '{ не json' },
    GLOBALS,
    LAYOUT,
    CLEAN_PAGE,
    CLEAN_HERO,
  ]);
  assert.ok(report.defects.some((d) => d.rule === 'package-json-invalid'));
});

test('синтаксическая ошибка ловится как раньше', () => {
  const report = explainBuildIntegrity(
    withBase({ path: 'app/page.tsx', content: `export default function Page() { return <main>ok</main>\n` }),
  );
  assert.ok(report.defects.some((d) => d.rule === 'syntax'));
});

/* ---------------- механический ремонт ---------------- */

test('ремонт: директива "use client" дописывается и дефект исчезает', () => {
  const files = withBase({
    path: 'app/page.tsx',
    content: `import { useState } from "react"\nexport default function Page() { const [n] = useState(0); return <main>{n}</main> }\n`,
  });
  const before = explainBuildIntegrity(files);
  const repaired = repairIntegrity(files, before);

  assert.ok(repaired.actions.some((a) => a.rule === 'use-client-missing'));
  const after = explainBuildIntegrity(repaired.files);
  assert.equal(after.ok, true, JSON.stringify(after.defects));
  assert.match(repaired.files.find((f) => f.path === 'app/page.tsx')!.content, /^"use client"/);
});

test('ремонт: дописан default-экспорт цели импорта', () => {
  const files = withBase(
    { path: 'app/page.tsx', content: `import Hero from "@/components/Hero"\nexport default function Page() { return <Hero /> }\n` },
    { path: 'components/Hero.tsx', content: `export function Hero() { return <h1>Привет</h1> }\n` },
  );
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  assert.equal(explainBuildIntegrity(repaired.files).ok, true);
  assert.match(repaired.files.find((f) => f.path === 'components/Hero.tsx')!.content, /export default Hero/);
});

test('ремонт: страница без default-экспорта получает его', () => {
  const files = withBase({
    path: 'app/page.tsx',
    content: `export function HomePage() { return <main className="bg-canvas">ok</main> }\n`,
  });
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  assert.equal(explainBuildIntegrity(repaired.files).ok, true);
});

test('ремонт: именованный импорт переводится в default-форму', () => {
  const files = withBase(
    { path: 'app/page.tsx', content: `import { Hero } from "@/components/Hero"\nexport default function Page() { return <Hero /> }\n` },
    { path: 'components/Hero.tsx', content: `export default function Hero() { return <h1>Привет</h1> }\n` },
  );
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  assert.match(repaired.files.find((f) => f.path === 'app/page.tsx')!.content, /import Hero from "@\/components\/Hero"/);
  assert.equal(explainBuildIntegrity(repaired.files).ok, true);
});

test('ремонт: api-роут удаляется из набора', () => {
  const files = withBase(CLEAN_PAGE, CLEAN_HERO, {
    path: 'app/api/items/route.ts',
    content: `export async function GET() { return Response.json([]) }\n`,
  });
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  assert.equal(repaired.files.some((f) => f.path === 'app/api/items/route.ts'), false);
  assert.equal(explainBuildIntegrity(repaired.files).ok, true);
});

test('ремонт: markdown-обвязка срезается, файл становится валидным', () => {
  const files = withBase({
    path: 'app/page.tsx',
    content: 'Вот полный код файла:\n```tsx\nexport default function Page() {\n  return <main className="bg-canvas">Привет</main>\n}\n```\n',
  });
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  const content = repaired.files.find((f) => f.path === 'app/page.tsx')!.content;
  assert.equal(content.includes('```'), false);
  assert.equal(content.startsWith('export default'), true);
  assert.equal(explainBuildIntegrity(repaired.files).ok, true);
});

test('ремонт: export const dynamic снимается', () => {
  const files = withBase({
    path: 'app/page.tsx',
    content: `export const dynamic = "force-dynamic"\nexport default function Page() { return <main>ok</main> }\n`,
  });
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  assert.equal(repaired.files.find((f) => f.path === 'app/page.tsx')!.content.includes('force-dynamic'), false);
});

test('ремонт идемпотентен: на чистом наборе ничего не делает', () => {
  const files = withBase(CLEAN_PAGE, CLEAN_HERO);
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  assert.equal(repaired.actions.length, 0);
  assert.deepEqual(repaired.files, files);
});

test('ремонт чинит несколько независимых дефектов за один проход', () => {
  const files = withBase(
    {
      path: 'app/page.tsx',
      content: `import { useState } from "react"\nimport Hero from "@/components/Hero"\nexport function Page() { const [n] = useState(0); return <Hero n={n} /> }\n`,
    },
    { path: 'components/Hero.tsx', content: `export function Hero({ n }: { n: number }) { return <h1>{n}</h1> }\n` },
  );
  const repaired = repairIntegrity(files, explainBuildIntegrity(files));
  const after = explainBuildIntegrity(repaired.files);
  assert.equal(after.ok, true, JSON.stringify(after.defects));
  assert.ok(repaired.actions.length >= 3, `ожидались ремонты директивы, default-экспортов: ${JSON.stringify(repaired.actions)}`);
});

/* ---------------- вспомогательные ---------------- */

test('formatDefectsForRepair группирует по файлу и берёт только ошибки', () => {
  const report = explainBuildIntegrity(
    withBase({ path: 'app/page.tsx', content: `import Ghost from "./Ghost"\nexport default function Page() { return <Ghost /> }\n` }),
  );
  const formatted = formatDefectsForRepair(report.defects);
  assert.match(formatted, /app\/page\.tsx:/);
  assert.match(formatted, /import-missing/);
});

test('formatDefectsForRepair на пустом списке даёт пустую строку', () => {
  assert.equal(formatDefectsForRepair([]), '');
});

test('filesNeedingRegeneration возвращает только файлы кода', () => {
  const report = explainBuildIntegrity([
    { path: 'package.json', content: '{ битый' },
    GLOBALS,
    LAYOUT,
    { path: 'app/page.tsx', content: `import Ghost from "./Ghost"\nexport default function Page() { return <Ghost /> }\n` },
  ]);
  const files = filesNeedingRegeneration(report.defects);
  assert.ok(files.includes('app/page.tsx'));
  assert.equal(files.includes('package.json'), false);
});

test('componentNameFor выводит имя компонента из пути', () => {
  assert.equal(componentNameFor('components/hero-banner.tsx'), 'HeroBanner');
  assert.equal(componentNameFor('app/catalog/page.tsx'), 'Catalog');
});

test('разбор не падает на файле с экзотическим содержимым', () => {
  assert.doesNotThrow(() =>
    explainBuildIntegrity([{ path: 'app/page.tsx', content: '  <<< не код >>>' }]),
  );
});
