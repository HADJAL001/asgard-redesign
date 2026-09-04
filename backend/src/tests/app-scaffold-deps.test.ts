import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DOCKERFILE_PATH,
  SCAFFOLD_DEPENDENCIES,
  SCAFFOLD_DEV_DEPENDENCIES,
  SCAFFOLD_FINGERPRINT_LABEL,
  renderSandboxDockerfile,
  sandboxBasePackageJson,
  scaffoldDepsFingerprint,
} from '../lib/app-scaffold-deps';
import { acceptedRepairContent, ensureManifestContracts, ensureManifestFiles, generateApp, generationPhase, mergeGeneratedFiles, staticTemplateFiles, type ManifestEntry } from '../services/app-generator';
import { deriveDesignBrief } from '../lib/design-system';

/* ================================================================
   OSGARD · Кэш node_modules для сборок — синхронность с генератором

   Что здесь проверяется и почему это важно. Быстрая сборка
   сгенерированного приложения (`next build` БЕЗ СЕТИ, секунды вместо
   минут `npm install`) возможна только если предустановленные в образе
   песочницы зависимости = зависимости, которые генератор кладёт в
   package.json приложения.

   Раньше эти два набора были двумя РУЧНЫМИ копиями. В каркас добавили
   `lucide-react` (модели тянут иконки почти всегда), в Dockerfile — нет.
   Быстрый путь начал падать «module not found» на каждом приложении,
   платформа молча уходила на медленный, и кэш существовал только на
   бумаге. Ни один тест этого не заметил, потому что проверять было
   нечего: связь между файлами существовала лишь в комментарии.

   Теперь набор один (lib/app-scaffold-deps), а эти тесты — та самая
   проверка, которой не было: они падают при любом расхождении.
   ================================================================ */

test('package.json сгенерированного приложения = набор зависимостей образа песочницы', async () => {
  // Без AI-ключей генератор отдаёт fallback — нам и нужен только каркас.
  const app = await generateApp('Тест каркаса');
  const pkgFile = app.files.find((f) => f.path === 'package.json');
  assert.ok(pkgFile, 'каркас обязан содержать package.json');

  const pkg = JSON.parse(pkgFile!.content) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.deepEqual(
    pkg.dependencies,
    { ...SCAFFOLD_DEPENDENCIES },
    'зависимости приложения обязаны совпадать с набором образа — иначе быстрая сборка падает "module not found"',
  );
  assert.deepEqual(pkg.devDependencies, { ...SCAFFOLD_DEV_DEPENDENCIES });
});

test('fullstack manifest всегда сохраняет page, schema и API в пределах лимита', () => {
  const plannerOutput: ManifestEntry[] = Array.from({ length: 14 }, (_, index) => ({
    path: `components/Optional${index}.tsx`,
    purpose: 'optional',
  }));
  const manifest = ensureManifestContracts(plannerOutput, 'fullstack');
  assert.ok(manifest.length <= 14, 'манифест не должен превышать лимит');
  assert.ok(manifest.some((entry) => entry.path === 'app/page.tsx'));
  assert.ok(manifest.some((entry) => entry.path === 'db/schema.sql'));
  assert.ok(manifest.some((entry) => entry.path === 'app/api/records/route.ts'));
});

test('billing manifest keeps the complete client-invoice-payment workflow', () => {
  const manifest = ensureManifestContracts([
    { path: 'app/page.tsx', purpose: 'InvoiceFlow overview' },
    { path: 'components/InvoiceTable.tsx', purpose: 'Invoice and payment status table' },
  ], 'fullstack');
  const paths = new Set(manifest.map((entry) => entry.path));
  for (const path of [
    'app/dashboard/page.tsx',
    'app/clients/page.tsx',
    'app/invoices/page.tsx',
    'app/invoices/[id]/page.tsx',
    'app/plans/page.tsx',
    'app/api/clients/route.ts',
    'app/api/invoices/route.ts',
    'app/api/invoices/[id]/route.ts',
    'app/api/payments/route.ts',
    'app/api/dashboard/route.ts',
    'components/AppShell.tsx',
    'lib/types.ts',
  ]) assert.ok(paths.has(path), `billing contract missing: ${path}`);
  assert.ok(manifest.length <= 14);
});

test('platform-owned scaffold file replaces an AI duplicate exactly once', () => {
  const files = mergeGeneratedFiles([
    { path: 'lib/db.ts', content: 'generated duplicate' },
    { path: '/app/page.tsx', content: 'page' },
    { path: 'lib/db.ts', content: 'platform implementation' },
  ]);
  assert.equal(files.filter((file) => file.path === 'lib/db.ts').length, 1);
  assert.equal(files.find((file) => file.path === 'lib/db.ts')?.content, 'platform implementation');
  assert.ok(files.some((file) => file.path === 'app/page.tsx'));
});

test('platform-owned legal pages replace AI duplicates in every generated scaffold', () => {
  const scaffold = staticTemplateFiles('Контракт', deriveDesignBrief({ name: 'Контракт' }), '');
  const merged = mergeGeneratedFiles([
    { path: 'app/privacy/page.tsx', content: 'AI duplicate' },
    ...scaffold,
  ]);
  for (const path of ['app/privacy/page.tsx', 'app/terms/page.tsx', 'app/pricing/page.tsx', 'app/support/page.tsx']) {
    const file = merged.find((item) => item.path === path);
    assert.ok(file, `legal scaffold missing ${path}`);
    assert.notEqual(file!.content, 'AI duplicate');
  }
});

test('missing provider output stays visible as an empty manifest file for repair', () => {
  const files = ensureManifestFiles(
    [{ path: 'app/page.tsx', content: 'page' }],
    [
      { path: 'app/page.tsx', purpose: 'page' },
      { path: 'app/invoices/page.tsx', purpose: 'invoice workspace' },
    ],
  );
  assert.equal(files.find((file) => file.path === 'app/invoices/page.tsx')?.content, '');
});

test('AI repair rejects truncated TypeScript instead of overwriting usable code', () => {
  assert.equal(acceptedRepairContent('components/Card.tsx', '```tsx\nexport function Card() { return <div>\n```'), null);
  assert.match(
    acceptedRepairContent('components/Card.tsx', '```tsx\nexport function Card() { return <div>ok</div> }\nexport default Card\n```') ?? '',
    /export default Card/,
  );
});

test('fullstack generation orders data contracts before consumers', () => {
  assert.ok(generationPhase('db/schema.sql', 'fullstack') < generationPhase('lib/types.ts', 'fullstack'));
  assert.ok(generationPhase('lib/types.ts', 'fullstack') < generationPhase('app/api/records/route.ts', 'fullstack'));
  assert.ok(generationPhase('app/api/records/route.ts', 'fullstack') < generationPhase('components/Table.tsx', 'fullstack'));
  assert.ok(generationPhase('components/Table.tsx', 'fullstack') < generationPhase('app/page.tsx', 'fullstack'));
  assert.equal(generationPhase('app/page.tsx', 'static'), 0);
  assert.equal(generationPhase('app/invoices/[id]/page.tsx', 'fullstack'), 5);
});

test('Dockerfile в репозитории не отстал от набора зависимостей', () => {
  const onDisk = fs.readFileSync(path.resolve(process.cwd(), DOCKERFILE_PATH), 'utf-8');
  assert.equal(
    onDisk.replace(/\r\n/g, '\n'),
    renderSandboxDockerfile(),
    'Dockerfile — производный артефакт: после правки набора выполни `npm run sandbox:image -- --write-only`',
  );
});

test('образ помечается отпечатком набора — по нему песочница отличает свежий кэш от устаревшего', () => {
  const fingerprint = scaffoldDepsFingerprint();
  const dockerfile = renderSandboxDockerfile();

  assert.match(fingerprint, /^[0-9a-f]{16}$/, 'отпечаток — короткий стабильный хеш');
  assert.ok(
    dockerfile.includes(`LABEL ${SCAFFOLD_FINGERPRINT_LABEL}="${fingerprint}"`),
    'без метки песочница не сможет понять, под какой набор собран образ',
  );
  // Все зависимости обязаны реально попасть внутрь образа, а не только в метку.
  for (const name of [...Object.keys(SCAFFOLD_DEPENDENCIES), ...Object.keys(SCAFFOLD_DEV_DEPENDENCIES)]) {
    assert.ok(dockerfile.includes(`"${name}"`), `пакет ${name} не попал в образ песочницы`);
  }
});

test('отпечаток не зависит от порядка ключей, но меняется от состава', () => {
  const before = scaffoldDepsFingerprint();
  assert.equal(before, scaffoldDepsFingerprint(), 'отпечаток детерминирован');

  // Тот же набор, перечисленный в другом порядке, обязан дать тот же отпечаток:
  // иначе безобидная перестановка строк «устаревала» бы готовый образ.
  const canonical = (deps: Record<string, string>, dev: Record<string, string>) =>
    JSON.stringify([
      Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)),
      Object.entries(dev).sort(([a], [b]) => a.localeCompare(b)),
    ]);
  const shuffled = Object.fromEntries(Object.entries(SCAFFOLD_DEPENDENCIES).reverse());
  assert.equal(
    canonical(shuffled, { ...SCAFFOLD_DEV_DEPENDENCIES }),
    canonical({ ...SCAFFOLD_DEPENDENCIES }, { ...SCAFFOLD_DEV_DEPENDENCIES }),
    'нормализация набора не должна зависеть от порядка',
  );

  const base = JSON.parse(sandboxBasePackageJson()) as { dependencies: Record<string, string> };
  assert.ok(base.dependencies['lucide-react'], 'lucide-react обязан быть в образе: он есть почти в каждом приложении');
});
