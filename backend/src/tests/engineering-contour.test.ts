import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { SourceFile } from '../lib/build-integrity';

/* ================================================================
   OSGARD · Инженерный контур (lib/project-engineering).

   Контур — это цикл ПРОВЕРКА → РЕМОНТ → ПОВТОРНАЯ ПРОВЕРКА → ВЕРДИКТ,
   которого у генерации не было вовсе: проект объявлялся `ready` сразу
   после записи файлов. Здесь проверяем ровно его обещания:

   • вердикт НИКОГДА не врёт (passed/repaired/broken — производны от
     финального разбора, а не от намерений);
   • контур не бросает наружу — генерация не имеет права падать из-за
     проверки;
   • без AI (в тестах провайдеры не сконфигурированы) он всё равно
     чинит то, что чинится механически;
   • реальная сборка в песочнице по умолчанию не дёргается на дешёвой
     глубине — иначе каждая генерация ждала бы Docker.
   ================================================================ */

let runEngineeringContour: typeof import('../lib/project-engineering').runEngineeringContour;
let shouldVerifyBuild: typeof import('../lib/project-engineering').shouldVerifyBuild;
let summarizeVerdict: typeof import('../lib/project-engineering').summarizeVerdict;
let corroborateIndependentReviewIssues: typeof import('../lib/project-engineering').corroborateIndependentReviewIssues;
let lessonsFromIndependentReviewIssues: typeof import('../lib/project-engineering').lessonsFromIndependentReviewIssues;
let brief: import('../lib/design-system').DesignBrief;

before(async () => {
  process.env.DB_PATH = ':memory:';
  process.env.OSGARD_REQUIRE_AI_REVIEW = '0'; // deterministic unit suite: never call paid providers
  process.env.CLAUDE_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';
  process.env.KIMI_API_KEY = '';
  process.env.MOONSHOT_API_KEY = '';
  process.env.DEEPSEEK_API_KEY = '';
  process.env.GROK_API_KEY = '';
  process.env.XAI_API_KEY = '';
  process.env.OSGARD_VERIFY_BUILD = '0'; // тесты не зависят от наличия Docker
  ({ runEngineeringContour, shouldVerifyBuild, summarizeVerdict, corroborateIndependentReviewIssues, lessonsFromIndependentReviewIssues } = await import('../lib/project-engineering'));
  const ds = await import('../lib/design-system');
  brief = ds.deriveDesignBrief({ name: 'Каталог', theme: 'shop' });
});

const PACKAGE_JSON: SourceFile = {
  path: 'package.json',
  content: JSON.stringify({ name: 'app', dependencies: { next: '^14.2.0', react: '^18.3.0', 'react-dom': '^18.3.0' } }),
};
const GLOBALS: SourceFile = { path: 'app/globals.css', content: '@tailwind base;\n' };
const LAYOUT: SourceFile = {
  path: 'app/layout.tsx',
  content: `import "./globals.css"\nexport const metadata = { title: "App" }\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return (<html lang="ru"><body>{children}</body></html>) }\n`,
};

function base(...files: SourceFile[]): SourceFile[] {
  return [PACKAGE_JSON, GLOBALS, LAYOUT, ...files];
}

const OPTS = () => ({ name: 'Каталог', brief, depth: 'quick' as const });

test('чистое приложение: вердикт passed, ремонтов нет', async () => {
  const files = base({
    path: 'app/page.tsx',
    content: `export default function Page() { return <main className="bg-canvas text-ink">Привет</main> }\n`,
  });
  const outcome = await runEngineeringContour(files, OPTS());

  assert.equal(outcome.report.verdict, 'passed');
  assert.equal(outcome.report.repairs.length, 0);
  assert.equal(outcome.report.initialErrors, 0);
  assert.equal(outcome.report.verifiedBy, 'static');
  assert.deepEqual(outcome.files, files, 'чистый набор не должен переписываться');
});

test('починяемое приложение: вердикт repaired, файлы реально исправлены', async () => {
  const files = base(
    {
      path: 'app/page.tsx',
      content: `import { useState } from "react"\nimport Hero from "@/components/Hero"\nexport function Page() { const [n] = useState(0); return <Hero n={n} /> }\n`,
    },
    { path: 'components/Hero.tsx', content: `export function Hero({ n }: { n: number }) { return <h1>{n}</h1> }\n` },
  );
  const outcome = await runEngineeringContour(files, OPTS());

  assert.equal(outcome.report.verdict, 'repaired');
  assert.ok(outcome.report.initialErrors > 0);
  assert.ok(outcome.report.repairs.length > 0, 'журнал ремонта обязан объяснить, что сделано');
  assert.equal(outcome.report.defects.filter((d) => d.severity === 'error').length, 0);
  assert.match(outcome.files.find((f) => f.path === 'app/page.tsx')!.content, /^"use client"/);
});

test('непочиняемое без AI приложение: честный broken, а не ложное «готово»', async () => {
  const files = base({
    path: 'app/page.tsx',
    content: `import Ghost from "@/components/Ghost"\nexport default function Page() { return <Ghost /> }\n`,
  });
  const outcome = await runEngineeringContour(files, OPTS());

  assert.equal(outcome.report.verdict, 'broken');
  assert.ok(outcome.report.defects.some((d) => d.rule === 'import-missing'));
});

test('вердикт производен от финального разбора: broken ⇔ остались ошибки', async () => {
  const files = base({
    path: 'app/page.tsx',
    content: `import { motion } from "framer-motion"\nexport default function Page() { return <motion.div /> }\n`,
  });
  const outcome = await runEngineeringContour(files, OPTS());
  const errors = outcome.report.defects.filter((d) => d.severity === 'error').length;

  assert.equal(outcome.report.verdict === 'broken', errors > 0);
});

test('summarizeVerdict объясняет только сломанный проект', async () => {
  const broken = await runEngineeringContour(
    base({ path: 'app/page.tsx', content: `import Ghost from "./Ghost"\nexport default function Page() { return <Ghost /> }\n` }),
    OPTS(),
  );
  const clean = await runEngineeringContour(
    base({ path: 'app/page.tsx', content: `export default function Page() { return <main>ok</main> }\n` }),
    OPTS(),
  );

  assert.match(String(summarizeVerdict(broken.report)), /дефект/i);
  assert.equal(summarizeVerdict(clean.report), null);
});

test('контур сообщает живой прогресс стадиями building/repairing', async () => {
  const phases: string[] = [];
  await runEngineeringContour(
    base({
      path: 'app/page.tsx',
      content: `import { useState } from "react"\nexport default function Page() { const [n] = useState(0); return <main>{n}</main> }\n`,
    }),
    { ...OPTS(), onProgress: (p) => phases.push(p.phase) },
  );

  assert.ok(phases.includes('building'), 'проверка обязана быть видна пользователю');
  assert.ok(phases.includes('repairing'), 'ремонт обязан быть виден пользователю');
});

test('контур не бросает наружу даже на мусорном наборе', async () => {
  const outcome = await runEngineeringContour([{ path: 'app/page.tsx', content: '<<< не код >>>' }], OPTS());
  assert.ok(['broken', 'repaired', 'unverified'].includes(outcome.report.verdict));
  assert.equal(Array.isArray(outcome.files), true);
});

test('пустой набор файлов не выдаёт ложное «готово»', async () => {
  const outcome = await runEngineeringContour([], OPTS());
  assert.notEqual(outcome.report.verdict, 'passed');
});

test('отчёт ограничен по объёму — БД не распухает от списка дефектов', async () => {
  const many: SourceFile[] = base(
    ...Array.from({ length: 30 }, (_, i) => ({
      path: `components/Broken${i}.tsx`,
      content: `import X from "./NoSuchFile${i}"\nexport default function Broken${i}() { return <X /> }\n`,
    })),
  );
  const outcome = await runEngineeringContour(many, OPTS());
  assert.ok(outcome.report.defects.length <= 40);
});

test('песочница по умолчанию только на глубокой генерации', () => {
  const prev = process.env.OSGARD_VERIFY_BUILD;
  delete process.env.OSGARD_VERIFY_BUILD;
  try {
    assert.equal(shouldVerifyBuild('quick'), false);
    assert.equal(shouldVerifyBuild('standard'), false);
    assert.equal(shouldVerifyBuild('deep'), true);

    process.env.OSGARD_VERIFY_BUILD = '1';
    assert.equal(shouldVerifyBuild('quick'), true, 'self-hosted воркер с Docker включает проверку явно');

    process.env.OSGARD_VERIFY_BUILD = '0';
    assert.equal(shouldVerifyBuild('deep'), false, 'выключатель сильнее глубины');
  } finally {
    if (prev === undefined) delete process.env.OSGARD_VERIFY_BUILD;
    else process.env.OSGARD_VERIFY_BUILD = prev;
  }
});

test('контур сохраняет файлы, которые не трогал', async () => {
  const untouched: SourceFile = { path: 'lib/format.ts', content: `export function money(n: number) { return n.toFixed(2) }\n` };
  const files = base(
    { path: 'app/page.tsx', content: `export function Page() { return <main>ok</main> }\n` },
    untouched,
  );
  const outcome = await runEngineeringContour(files, OPTS());

  assert.deepEqual(
    outcome.files.find((f) => f.path === 'lib/format.ts'),
    untouched,
  );
});

test('семантическая ошибка независимой проверки блокирует выпуск', () => {
  const defects = corroborateIndependentReviewIssues(
    [{ path: 'app/page.tsx', severity: 'error', message: 'Неподтверждённая претензия' }],
    [],
  );
  assert.equal(defects[0]?.severity, 'error');
});

test('ошибка независимой проверки блокирует выпуск без детерминированного дубля', () => {
  const defects = corroborateIndependentReviewIssues(
    [{ path: 'app/page.tsx', severity: 'error', message: 'Импорт не существует' }],
    [{ rule: 'import-missing', severity: 'error', file: 'app/page.tsx', message: 'Модуль не найден', autoFixable: false }],
  );
  assert.equal(defects[0]?.severity, 'error');
});

test('review findings become reusable semantic lessons', () => {
  const lessons = lessonsFromIndependentReviewIssues([
    { rule: 'independent-ai-review', severity: 'error', file: 'app/api/records/route.ts', message: 'SQL UPDATE has no schema migration', autoFixable: false },
    { rule: 'independent-ai-review', severity: 'error', file: 'components/AppShell.tsx', message: 'The requested feature is not implemented', autoFixable: false },
  ]);
  assert.deepEqual(lessons, [
    { rule: 'review-data-contract', count: 1 },
    { rule: 'review-feature-completeness', count: 1 },
  ]);
});
