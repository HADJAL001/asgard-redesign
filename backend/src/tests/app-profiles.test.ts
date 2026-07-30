import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { explainBuildIntegrity, repairIntegrity, type SourceFile } from '../lib/build-integrity';
import { FULLSTACK_DEPENDENCIES, normalizeAppProfile } from '../lib/app-profiles';

/* ================================================================
   OSGARD · Профиль приложения (lib/app-profiles).

   Платформа умела ровно один вид приложения — статический экспорт.
   Первая живая прод-генерация показала цену фактом: 48 файлов, ноль
   API-роутов, ноль обращений к базе. Профиль `fullstack` снимает это
   ограничение.

   Проверяем ДВЕ стороны, и вторая важнее первой:
   • fullstack: серверный роут, "use server", next/headers и драйвер
     базы `pg` больше не дефект, а механический ремонт НЕ удаляет
     app/api (раньше удалял безусловно);
   • static (по умолчанию): всё перечисленное по-прежнему бракуется.
     Профиль обязан РАСШИРЯТЬ поведение, а не ослаблять старое —
     регрессия здесь означала бы, что статические приложения молча
     начали выпускаться с кодом, который не соберётся.
   ================================================================ */

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

const PAGE: SourceFile = {
  path: 'app/page.tsx',
  content: `export default function Page() {
  return <main className="min-h-screen bg-canvas text-ink">Заметки</main>
}
`,
};

const API_ROUTE: SourceFile = {
  path: 'app/api/notes/route.ts',
  content: `import { query } from "@/lib/db"

export async function GET() {
  const notes = await query<{ id: number; title: string }>("SELECT id, title FROM notes")
  return Response.json({ notes })
}
`,
};

/* Модуль доступа к базе — тот, что платформа вписывает сама (DB_MODULE_PATH).
   Здесь он нужен вместе с `next/headers`: проверяется, что для fullstack не
   бракуется НИ драйвер базы, НИ серверный API самого Next. */
const DB_MODULE: SourceFile = {
  path: 'lib/db.ts',
  content: `import { cookies } from "next/headers"
import { Pool } from "pg"

let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return pool
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  void cookies()
  const result = await getPool().query(sql, params)
  return result.rows as T[]
}
`,
};

function packageJson(fullstack: boolean): SourceFile {
  return {
    path: 'package.json',
    content: JSON.stringify({
      name: 'app',
      dependencies: {
        next: '^14.2.0',
        react: '^18.3.0',
        'react-dom': '^18.3.0',
        ...(fullstack ? FULLSTACK_DEPENDENCIES : {}),
      },
    }),
  };
}

const FULLSTACK_SET: SourceFile[] = [packageJson(true), GLOBALS, LAYOUT, PAGE, API_ROUTE, DB_MODULE];

test('normalizeAppProfile: неизвестное значение падает в самый безопасный режим', () => {
  assert.equal(normalizeAppProfile('fullstack'), 'fullstack');
  assert.equal(normalizeAppProfile('static'), 'static');
  assert.equal(normalizeAppProfile(undefined), 'static');
  assert.equal(normalizeAppProfile('произвольная строка из БД'), 'static');
});

test('fullstack: серверный роут, next/headers и драйвер базы pg — не дефекты', () => {
  const report = explainBuildIntegrity(FULLSTACK_SET, 'fullstack');

  assert.equal(report.analyzed, true);
  const rules = report.defects.filter((d) => d.severity === 'error').map((d) => d.rule);
  assert.ok(!rules.includes('api-route-unsupported'), `api-роут забракован: ${rules.join(', ')}`);
  assert.ok(!rules.includes('server-only-api'), `next/headers забракован: ${rules.join(', ')}`);
  assert.ok(!rules.includes('dependency-missing'), `драйвер базы pg не разрешён: ${rules.join(', ')}`);
  assert.equal(report.ok, true, `остались дефекты: ${rules.join(', ')}`);
});

test('fullstack: проверка статического экспорта помечена как НЕ ВЫПОЛНЕННАЯ, а не пройденная', () => {
  const report = explainBuildIntegrity(FULLSTACK_SET, 'fullstack');
  const check = report.checks.find((c) => c.key === 'static');

  assert.ok(check, 'проверка static исчезла из отчёта');
  /* Подпись обязана говорить «не применяется». «Нет серверных конструкций» на
     приложении, смысл которого в серверных конструкциях, — отчёт, которому
     нельзя верить, даже если формально passed:true. */
  assert.match(check!.label, /не применяется/);
  assert.match(check!.detail, /не проверялись/);
});

test('fullstack: механический ремонт НЕ удаляет app/api', () => {
  const report = explainBuildIntegrity(FULLSTACK_SET, 'fullstack');
  const outcome = repairIntegrity(FULLSTACK_SET, report);

  assert.ok(
    outcome.files.some((f) => f.path === 'app/api/notes/route.ts'),
    'ремонт удалил серверный роут у fullstack-приложения',
  );
  assert.ok(!outcome.actions.some((a) => a.rule === 'api-route-unsupported'));
});

test('static (по умолчанию): тот же набор по-прежнему бракуется — регрессии нет', () => {
  const report = explainBuildIntegrity(FULLSTACK_SET);

  const rules = report.defects.filter((d) => d.severity === 'error').map((d) => d.rule);
  assert.ok(rules.includes('api-route-unsupported'), 'api-роут перестал быть дефектом для static');
  assert.ok(rules.includes('server-only-api'), 'next/headers перестал быть дефектом для static');
  assert.equal(report.ok, false);

  const check = report.checks.find((c) => c.key === 'static');
  assert.equal(check?.label, 'Статический экспорт');
});

test('static: механический ремонт по-прежнему удаляет app/api', () => {
  const report = explainBuildIntegrity(FULLSTACK_SET);
  const outcome = repairIntegrity(FULLSTACK_SET, report);

  assert.ok(!outcome.files.some((f) => f.path === 'app/api/notes/route.ts'));
  assert.ok(outcome.actions.some((a) => a.rule === 'api-route-unsupported'));
});

test('static: драйвер базы в зависимостях не открывает импорт произвольного пакета', () => {
  const withStripe: SourceFile[] = [
    packageJson(false),
    GLOBALS,
    LAYOUT,
    {
      path: 'app/page.tsx',
      content: `import Stripe from "stripe"

export default function Page() {
  return <main>{typeof Stripe}</main>
}
`,
    },
  ];

  const report = explainBuildIntegrity(withStripe, 'fullstack');
  const rules = report.defects.map((d) => d.rule);
  assert.ok(rules.includes('dependency-missing'), 'allow-list профиля пропустил необъявленный пакет');
});
