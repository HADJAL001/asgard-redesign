import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonsFromBuildLog, stripAnsi } from '../lib/build-log-lessons';

/* ================================================================
   OSGARD · Уроки из лога настоящей сборки (lib/build-log-lessons).

   Зачем этот файл. Стенд `scripts/measure-build-lessons.ts` честнее —
   он гоняет настоящий `next build` — но он же и медленный, и на этой
   машине падает воркером Next (0xC0000409), то есть в CI на него
   опереться нельзя. Поэтому здесь зафиксированы КУСКИ НАСТОЯЩЕГО
   вывода компилятора, снятые стендом, — парсер проверяется тем же
   текстом, который он увидит в бою.

   Главная опасность модуля — «проверка, которая ничего не проверяет»:
   сигнатура, выдуманная по памяти, не совпадёт с реальным текстом Next
   и правило не сработает НИКОГДА, а тест на самодельном логе при этом
   будет зелёным. Отсюда два требования к каждому случаю ниже:
   1) положительный вход — дословный фрагмент лога, с ANSI-раскраской,
      как Next печатает её и без терминала;
   2) отрицательный контроль — лог, где этого дефекта нет, и правило
      обязано молчать.
   ================================================================ */

function rules(log: string): string[] {
  return lessonsFromBuildLog(log)
    .map((l) => l.rule)
    .sort();
}

/* Раскраска настоящая: Next печатает путь зелёным даже в пайп. Первая версия
   парсера сравнивала первый символ пути с "." и не срабатывала никогда. */
const RESOLVE_OWN_FILE = `
Failed to compile.

./app/page.tsx
Module not found: Can't resolve '\x1b[32m./components/header\x1b[39m'

https://nextjs.org/docs/messages/module-not-found
`;

const RESOLVE_PACKAGE = `
Failed to compile.

./app/page.tsx
Module not found: Can't resolve '\x1b[32mframer-motion\x1b[39m'

https://nextjs.org/docs/messages/module-not-found
`;

const USE_CLIENT_MISSING = `
Failed to compile.

./components/counter.tsx
Error:
  x You're importing a component that needs useState. This React hook only works in a client component. To fix, mark the file (or its parent) with the "use client" directive.
`;

const BROWSER_GLOBAL = `
Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
ReferenceError: window is not defined
    at o (/app/.next/server/app/page.js:1:2210)
Export encountered errors on following paths:
	/page: /
`;

const SYNTAX = `
Failed to compile.

./app/page.tsx
Error:
  x Unexpected token \`div\`. Expected jsx identifier
    ,-[/app/app/page.tsx:5:1]
`;

const PRERENDER_UNKNOWN = `
Error occurred prerendering page "/about". Read more: https://nextjs.org/docs/messages/prerender-error
TypeError: Cannot read properties of undefined (reading 'map')
Export encountered errors on following paths:
	/about/page: /about
`;

const CLEAN_BUILD = `
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (5/5)
   Finalizing page optimization ...

Route (app)                              Size     First Load JS
┌ ○ /                                    1.2 kB          89 kB
`;

test('ANSI-раскраска снимается: путь в логе снова начинается с точки', () => {
  const clean = stripAnsi(RESOLVE_OWN_FILE);
  assert.ok(clean.includes("Can't resolve './components/header'"));
  assert.ok(!clean.includes('\x1b'));
});

test('свой файл не найден → import-missing, и это НЕ dependency-missing', () => {
  const got = rules(RESOLVE_OWN_FILE);
  assert.deepEqual(got, ['import-missing']);
});

test('пакет не найден → dependency-missing, и это НЕ import-missing', () => {
  const got = rules(RESOLVE_PACKAGE);
  assert.deepEqual(got, ['dependency-missing']);
});

test('оба класса в одном логе учат обоим урокам сразу', () => {
  const got = rules(RESOLVE_OWN_FILE + RESOLVE_PACKAGE);
  assert.deepEqual(got, ['dependency-missing', 'import-missing']);
});

test('настоящий текст Next про useState → use-client-missing', () => {
  assert.deepEqual(rules(USE_CLIENT_MISSING), ['use-client-missing']);
});

test('две сигнатуры одного правила дают ОДИН урок, а не два', () => {
  /* В логе выше срабатывают обе сигнатуры use-client-missing: и «needs useState…
     client component», и «mark the file (or its parent)…». Урок обязан остаться один,
     иначе счётчик памяти раздувается на ровном месте. */
  const lessons = lessonsFromBuildLog(USE_CLIENT_MISSING);
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].count, 1);
});

test('window на верхнем уровне → browser-global-toplevel без запасного правила', () => {
  const got = rules(BROWSER_GLOBAL);
  assert.deepEqual(got, ['browser-global-toplevel']);
  assert.ok(!got.includes('prerender-failed'), 'конкретная причина вытесняет запасную');
});

test('незакрытый тег → syntax', () => {
  assert.deepEqual(rules(SYNTAX), ['syntax']);
});

test('пререндер упал по неопознанной причине → запасное правило prerender-failed', () => {
  assert.deepEqual(rules(PRERENDER_UNKNOWN), ['prerender-failed']);
});

/* ---- отрицательные контроли: прибор обязан показывать ноль ---- */

test('успешная сборка не учит платформу ничему', () => {
  assert.deepEqual(lessonsFromBuildLog(CLEAN_BUILD), []);
});

test('пустой лог не учит платформу ничему', () => {
  assert.deepEqual(lessonsFromBuildLog(''), []);
  assert.deepEqual(lessonsFromBuildLog('   \n  '), []);
});

test('незнакомое падение даёт ноль уроков, а не правило-упрёк', () => {
  /* Лог настоящий, но класс дефекта парсеру неизвестен и страница не названа.
     Честный ноль лучше урока «не ломай сборку»: он занял бы слот в промпте и
     не изменил бы ни строки кода. */
  const unknown = `
Failed to compile.

./app/page.tsx
Error: ENOSPC: no space left on device, write
`;
  assert.deepEqual(lessonsFromBuildLog(unknown), []);
});
