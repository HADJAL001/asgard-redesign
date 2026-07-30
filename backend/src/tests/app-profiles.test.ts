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
   • fullstack: серверный роут, "use server", next/headers и клиент
     Supabase больше не дефект, а механический ремонт НЕ удаляет
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
  content: `import { createServerClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase.from("notes").select("*")
  return Response.json({ notes: data ?? [] })
}
`,
};

const SUPABASE_SERVER: SourceFile = {
  path: 'lib/supabase/server.ts',
  content: `import { cookies } from "next/headers"
import { createServerClient as createClient } from "@supabase/ssr"

export function createServerClient() {
  const store = cookies()
  return createClient("https://example.supabase.co", "anon-key", {
    cookies: { get: (name: string) => store.get(name)?.value },
  })
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

const FULLSTACK_SET: SourceFile[] = [packageJson(true), GLOBALS, LAYOUT, PAGE, API_ROUTE, SUPABASE_SERVER];

test('normalizeAppProfile: неизвестное значение падает в самый безопасный режим', () => {
  assert.equal(normalizeAppProfile('fullstack'), 'fullstack');
  assert.equal(normalizeAppProfile('static'), 'static');
  assert.equal(normalizeAppProfile(undefined), 'static');
  assert.equal(normalizeAppProfile('произвольная строка из БД'), 'static');
});

test('fullstack: серверный роут, next/headers и клиент Supabase — не дефекты', () => {
  const report = explainBuildIntegrity(FULLSTACK_SET, 'fullstack');

  assert.equal(report.analyzed, true);
  const rules = report.defects.filter((d) => d.severity === 'error').map((d) => d.rule);
  assert.ok(!rules.includes('api-route-unsupported'), `api-роут забракован: ${rules.join(', ')}`);
  assert.ok(!rules.includes('server-only-api'), `next/headers забракован: ${rules.join(', ')}`);
  assert.ok(!rules.includes('dependency-missing'), `клиент Supabase не разрешён: ${rules.join(', ')}`);
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

test('static: клиент Supabase в зависимостях не открывает импорт произвольного пакета', () => {
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
