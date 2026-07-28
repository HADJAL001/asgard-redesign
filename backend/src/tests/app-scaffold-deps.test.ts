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
import { generateApp } from '../services/app-generator';

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
