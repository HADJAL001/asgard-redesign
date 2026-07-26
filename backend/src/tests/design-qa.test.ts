import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDesignScore,
  explainDesignQuality,
  filesNeedingRepair,
  formatIssuesForRepair,
} from '../lib/design-qa';
import { deriveDesignBrief, renderFallbackPage } from '../lib/design-system';

/* ================================================================
   OSGARD · Design QA (lib/design-qa) — критик сгенерированного UI.

   Раньше единственной проверкой сгенерированного кода был
   ts.transpileModule (только синтаксис). Здесь проверяем, что критик
   ловит РЕАЛЬНЫЕ дефекты, из-за которых интерфейс выглядит дёшево и
   не работает: разнобой палитр, недоступность, отсутствие адаптива,
   сломанная семантика, текст-рыба.

   Отдельно проверяем инвариант отчёта: балл ПРОИЗВОДЕН от разбора
   (тот же приём, что в proof-of-craft #62) — число и объяснение не
   могут разойтись.
   ================================================================ */

const CLEAN_PAGE = `export default function Page() {
  const items = ["Первый", "Второй"]
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="ds-container py-ds-6">
        <h1 className="font-display text-3xl sm:text-4xl">Каталог</h1>
        <h2 className="mt-ds-2 text-lg text-ink-muted">Что у нас есть сейчас</h2>
        <img src="/hero.png" alt="Витрина магазина" className="mt-ds-4 w-full rounded-ds" />
        {items.length === 0 ? (
          <p className="text-ink-muted">Пока пусто — добавьте первый товар.</p>
        ) : (
          <ul className="mt-ds-4 grid gap-ds-3 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item} className="ds-card p-ds-3">{item}</li>
            ))}
          </ul>
        )}
        <button type="button" className="ds-btn ds-btn-primary mt-ds-4">Купить</button>
        <a href="/about" className="mt-ds-2 block text-accent">Подробнее</a>
      </div>
    </main>
  )
}
`;

const DIRTY_PAGE = `export default function Page() {
  const items = ["a", "b"]
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="w-[1400px] p-8">
        <h1 className="text-3xl" style={{ color: "#ffffff" }}>Заголовок</h1>
        <h3 className="text-[#94a3b8]">Пропущенный уровень</h3>
        <img src="/x.png" />
        <p>Lorem ipsum dolor sit amet, consectetur.</p>
        <div onClick={() => alert("клик")} className="bg-[#1e293b] focus:outline-none">Кнопка</div>
        <button className="bg-indigo-600">Отправить</button>
        <a>Ссылка без href</a>
        <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
      </div>
    </main>
  )
}
`;

/* ---------------- Чистый файл ---------------- */

test('чистый файл: высокий балл и отсутствие грубых нарушений', () => {
  const report = explainDesignQuality([{ path: 'app/page.tsx', content: CLEAN_PAGE }]);

  assert.equal(report.analyzedFiles, 1);
  assert.equal(report.issues.filter((i) => i.severity === 'error').length, 0, 'грубых нарушений нет');
  assert.ok(report.score >= 90, `балл должен быть высоким, получено ${report.score}`);
});

test('фоллбэк-страница самой дизайн-системы проходит собственный критик', () => {
  // Если бы наш же фоллбэк нарушал контракт, требовать его от модели было бы нечестно.
  const brief = deriveDesignBrief({ name: 'Проект', theme: 'general' });
  const report = explainDesignQuality([{ path: 'app/page.tsx', content: renderFallbackPage(brief, 'Проект', 'подсказка') }]);

  assert.equal(report.issues.filter((i) => i.severity === 'error').length, 0);
});

/* ---------------- Грязный файл: ловим каждый класс дефекта ---------------- */

test('грязный файл: пойман каждый класс дефекта', () => {
  const report = explainDesignQuality([{ path: 'app/page.tsx', content: DIRTY_PAGE }]);
  const rules = new Set(report.issues.map((i) => i.rule));

  const expected = [
    'palette/default-tailwind', // bg-slate-950, text-white, bg-indigo-600
    'palette/raw-color', // text-[#94a3b8], bg-[#1e293b]
    'palette/inline-style-color', // style={{ color: "#ffffff" }}
    'a11y/img-alt', // <img> без alt
    'a11y/button-type', // <button> без type
    'a11y/clickable-div', // <div onClick>
    'a11y/anchor-href', // <a> без href
    'a11y/focus-removed', // outline-none без focus-visible
    'responsive/fixed-width', // w-[1400px]
    'responsive/no-breakpoints', // ни одного sm:/md:/lg:
    'semantics/heading-skip', // h1 → h3
    'content/lorem', // lorem ipsum
    'content/no-empty-state', // .map() без пустого состояния
  ];

  for (const rule of expected) {
    assert.ok(rules.has(rule), `правило ${rule} должно было сработать`);
  }
  assert.ok(report.score < 40, `балл должен быть низким, получено ${report.score}`);
});

test('каждое нарушение указывает файл и (где возможно) строку', () => {
  const report = explainDesignQuality([{ path: 'app/page.tsx', content: DIRTY_PAGE }]);
  for (const issue of report.issues) {
    assert.equal(issue.file, 'app/page.tsx');
    assert.ok(issue.message.length > 10, 'сообщение объясняет суть, а не просто код правила');
    if (issue.line !== undefined) {
      assert.ok(issue.line >= 1 && issue.line <= DIRTY_PAGE.split('\n').length, `строка ${issue.line} в пределах файла`);
    }
  }
});

test('пометка в комментарии не считается нарушением (нет ложных срабатываний)', () => {
  const withComment = `// Не используй bg-[#ffffff] и bg-slate-900 — только токены.
/* Также запрещено: text-[#000000] */
export default function Page() {
  return <main className="bg-canvas text-ink"><h1>Ок</h1></main>
}
`;
  const report = explainDesignQuality([{ path: 'app/page.tsx', content: withComment }]);
  const paletteIssues = report.issues.filter((i) => i.rule.startsWith('palette/'));
  assert.equal(paletteIssues.length, 0, 'упоминание в комментарии — не нарушение');
});

/* ---------------- Инварианты отчёта ---------------- */

test('балл производен от разбора: сумма факторов равна score', () => {
  for (const content of [CLEAN_PAGE, DIRTY_PAGE]) {
    const report = explainDesignQuality([{ path: 'app/page.tsx', content }]);
    const sum = report.factors.reduce((acc, f) => acc + f.points, 0);
    assert.equal(report.score, sum, 'score = сумма факторов, расхождение невозможно');
    assert.equal(report.score, computeDesignScore([{ path: 'app/page.tsx', content }]), 'computeDesignScore = тот же источник');
  }
});

test('балл всегда в диапазоне 0..100, факторы не уходят в минус', () => {
  const awful = Array.from({ length: 5 }, (_, i) => ({ path: `components/C${i}.tsx`, content: DIRTY_PAGE }));
  const report = explainDesignQuality(awful);

  assert.ok(report.score >= 0 && report.score <= 100, `балл ${report.score} вне диапазона`);
  for (const f of report.factors) {
    assert.ok(f.points >= 0 && f.points <= f.maxPoints, `фактор ${f.key} вне диапазона`);
  }
});

test('нет файлов интерфейса — честный ноль, а не ложная сотня', () => {
  // Пустая сотня была бы худшим исходом: витрина хвалила бы несуществующий UI.
  const report = explainDesignQuality([{ path: 'package.json', content: '{}' }]);
  assert.equal(report.score, 0);
  assert.equal(report.analyzedFiles, 0);
});

test('файлы самой дизайн-системы не судятся её же правилами', () => {
  // В tailwind.config.ts сырые hex — единственный способ объявить токены.
  const report = explainDesignQuality([
    { path: 'tailwind.config.ts', content: 'const c = { colors: { canvas: "#0a0a0f" } }' },
    { path: 'app/globals.css', content: ':root { --ds-canvas: #0a0a0f; }' },
    { path: 'app/page.tsx', content: CLEAN_PAGE },
  ]);
  assert.equal(report.analyzedFiles, 1, 'проанализирована только страница');
});

/* ---------------- Подготовка данных для авторемонта ---------------- */

test('formatIssuesForRepair: группирует по файлу и ограничивает объём', () => {
  const report = explainDesignQuality([
    { path: 'app/page.tsx', content: DIRTY_PAGE },
    { path: 'components/Card.tsx', content: DIRTY_PAGE },
  ]);

  const formatted = formatIssuesForRepair(report.issues, 6);
  assert.ok(formatted.includes('app/page.tsx'), 'файл назван');
  assert.ok(formatted.includes('['), 'указан код правила');
  const bulletCount = (formatted.match(/\n {2}- /g) || []).length;
  assert.ok(bulletCount <= 6, `не более 6 пунктов, получено ${bulletCount}`);
});

test('formatIssuesForRepair: пустой список даёт пустую строку', () => {
  assert.equal(formatIssuesForRepair([]), '');
});

test('filesNeedingRepair: приоритет файлам с грубыми нарушениями', () => {
  const report = explainDesignQuality([
    { path: 'app/page.tsx', content: DIRTY_PAGE },
    { path: 'components/Ok.tsx', content: CLEAN_PAGE },
  ]);

  const files = filesNeedingRepair(report.issues);
  assert.ok(files.includes('app/page.tsx'), 'грязный файл в списке на ремонт');
  assert.ok(!files.includes('components/Ok.tsx'), 'чистый файл не перегенерируем зря');
});
