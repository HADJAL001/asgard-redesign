import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainDesignQuality } from '../lib/design-qa';
import {
  TEXT_CONTRAST_MIN,
  clampBriefProposal,
  contrastRatio,
  DESIGN_SYSTEM_PATHS,
  deriveDesignBrief,
  renderDesignSystemFiles,
} from '../lib/design-system';

/* ================================================================
   OSGARD · Дизайн-студия: контраст ПАР токенов + перенастройка облика.

   Дизайн-система гарантирует контраст своих канонических пар
   (ink→canvas, primaryInk→primary). Но код может сложить легальные
   токены НЕСОВМЕСТИМО — `bg-primary text-ink-muted`. Регуляркой это
   не поймать: нужно взять палитру КОНКРЕТНОГО проекта и посчитать
   реальное отношение по WCAG. Здесь проверяем, что проверка ловит
   именно плохие пары и молчит на хороших и на неизвестном фоне.

   Плюс инвариант перенастройки: какой бы выбор ни сделал пользователь,
   получить нечитаемую палитру он не может — зажим тот же, что для AI.
   ================================================================ */

const brief = deriveDesignBrief({ name: 'Лавка редких артефактов', theme: 'ecommerce' });

function reportFor(content: string) {
  return explainDesignQuality([{ path: 'app/page.tsx', content }], brief);
}

function pairIssues(content: string) {
  return reportFor(content).issues.filter((i) => i.rule === 'a11y/token-pair-contrast');
}

/* ---------------- Плохие пары ловятся ---------------- */

test('несовместимая пара токенов поймана с реальным числом контраста', () => {
  // Оба токена легальны по отдельности, но вместе нечитаемы.
  const bad = `export default function Page() {
  return <main className="bg-primary text-ink-muted"><h1>Купить</h1></main>
}`;
  const issues = pairIssues(bad);

  assert.equal(issues.length, 1, 'нарушение найдено ровно одно');
  assert.match(issues[0].message, /bg-primary/, 'назван фон');
  assert.match(issues[0].message, /text-ink-muted/, 'назван текст');
  assert.match(issues[0].message, /\d+\.\d+:1/, 'указано реальное отношение, а не «плохо»');

  // Число в сообщении должно совпадать с фактическим замером — не «примерно».
  const actual = contrastRatio(brief.palette.muted, brief.palette.primary);
  assert.ok(issues[0].message.includes(actual.toFixed(2)), `в сообщении ожидалось ${actual.toFixed(2)}`);
  assert.ok(actual < TEXT_CONTRAST_MIN, 'пара действительно провальная');
});

test('нарушение пар токенов снижает балл дизайна', () => {
  const good = `export default function Page() {
  return <main className="bg-primary text-primary-ink"><h1>Купить</h1></main>
}`;
  const bad = `export default function Page() {
  return <main className="bg-primary text-ink-muted"><h1>Купить</h1></main>
}`;
  assert.ok(reportFor(bad).score < reportFor(good).score, 'плохая пара стоит очков');
});

test('адаптивные и состояние-префиксы не мешают распознать токен', () => {
  const bad = `export default function Page() {
  return <main className="md:bg-primary hover:text-ink-muted"><h1>Купить</h1></main>
}`;
  assert.equal(pairIssues(bad).length, 1, 'префиксы md:/hover: сняты, токен распознан');
});

/* ---------------- Ложных срабатываний нет ---------------- */

test('каноническая пара дизайн-системы нарушением не считается', () => {
  const good = `export default function Page() {
  return (
    <main className="bg-canvas text-ink">
      <div className="bg-surface text-ink"><h1>Каталог</h1></div>
      <button type="button" className="bg-primary text-primary-ink">Купить</button>
      <span className="bg-accent text-accent-ink">Новинка</span>
    </main>
  )
}`;
  assert.equal(pairIssues(good).length, 0, 'канонические пары чисты');
});

test('текст без явного фона не судится — предок статически неизвестен', () => {
  // Честность важнее полноты: гадать о фоне предка нельзя, поэтому молчим.
  const unknown = `export default function Page() {
  return <main><p className="text-ink-muted">Текст без указанного фона</p></main>
}`;
  assert.equal(pairIssues(unknown).length, 0, 'без известного фона выводов не делаем');
});

test('вычисляемый className не разбирается (не притворяемся, что знаем)', () => {
  const dynamic = `export default function Page({ dark }: { dark: boolean }) {
  return <main className={dark ? "bg-primary text-ink-muted" : "bg-canvas text-ink"}>x</main>
}`;
  assert.equal(pairIssues(dynamic).length, 0, 'выражение не разбирается');
});

test('проект без брифа (legacy) парами токенов не судится', () => {
  const bad = `export default function Page() {
  return <main className="bg-primary text-ink-muted">x</main>
}`;
  const withoutBrief = explainDesignQuality([{ path: 'app/page.tsx', content: bad }]);
  assert.equal(
    withoutBrief.issues.filter((i) => i.rule === 'a11y/token-pair-contrast').length,
    0,
    'сравнивать не с чем — молчим',
  );
});

/* ---------------- Перенастройка облика ---------------- */

test('перенастройка: любой выбор пользователя остаётся читаемым', () => {
  // Пользователь может «накрутить» что угодно — зажим тот же, что для AI.
  const choices = [
    { archetype: 'editorial', scheme: 'light', hue: 20, saturation: 0.9 },
    { archetype: 'playful', scheme: 'dark', hue: 300, saturation: 0 },
    { archetype: 'cockpit', scheme: 'light', hue: 60, density: 'compact', radiusStyle: 'pill' },
    { scheme: 'light', hue: 55, accentHue: 55, saturation: 1 }, // жёлтый на жёлтом
  ] as const;

  for (const choice of choices) {
    const tuned = clampBriefProposal(brief, choice);
    assert.ok(
      contrastRatio(tuned.palette.ink, tuned.palette.canvas) >= TEXT_CONTRAST_MIN,
      `выбор ${JSON.stringify(choice)} дал нечитаемый текст`,
    );
    assert.ok(
      contrastRatio(tuned.palette.primaryInk, tuned.palette.primary) >= TEXT_CONTRAST_MIN,
      `выбор ${JSON.stringify(choice)} дал нечитаемую кнопку`,
    );
  }
});

test('перенастройка заменяет весь platform-owned дизайн и legal scaffold', () => {
  const tuned = clampBriefProposal(brief, { archetype: 'gallery', scheme: 'light' });
  const rendered = renderDesignSystemFiles(tuned, 'Лавка', 'Описание');

  assert.deepEqual(
    rendered.map((f) => f.path).sort(),
    [...DESIGN_SYSTEM_PATHS].sort(),
    'пользовательские страницы и компоненты не переписываются, но обязательные legal-страницы всегда получают текущую дизайн-систему',
  );
  const legalFiles = rendered.filter((file) => file.path.startsWith('app/') && file.path.endsWith('/page.tsx'));
  const designFiles = rendered.filter((file) => !legalFiles.includes(file));
  assert.equal(legalFiles.length, 4, 'в scaffold входят четыре обязательные legal-страницы');
  assert.ok(
    legalFiles.every((file) => file.content.includes('bg-canvas') && file.content.includes('font-display')),
    'legal-страницы используют токены актуальной дизайн-системы',
  );
  assert.ok(
    designFiles.every((file) => file.content.includes(tuned.palette.canvas) || file.content.includes(tuned.typography.body)),
    'системные файлы содержат палитру или типографику выбранного брифа',
  );
});

test('перенастройка детерминирована: тот же выбор — тот же результат', () => {
  const choice = { archetype: 'boutique', scheme: 'light', hue: 30, saturation: 0.5 } as const;
  assert.deepEqual(clampBriefProposal(brief, choice), clampBriefProposal(brief, choice));
});

test('перенастройка после смены палитры честно пересчитывает балл', () => {
  // Код не менялся — но с новой палитрой пара токенов может стать провальной,
  // и балл обязан это отразить, а не остаться прежним из вежливости.
  const content = `export default function Page() {
  return <main className="bg-accent text-ink-muted"><h1>Заголовок</h1></main>
}`;
  const light = clampBriefProposal(brief, { scheme: 'light', hue: 50, saturation: 0.65 });
  const dark = clampBriefProposal(brief, { scheme: 'dark', hue: 250, saturation: 0.65 });

  const files = [{ path: 'app/page.tsx', content }];
  const a = explainDesignQuality(files, light).score;
  const b = explainDesignQuality(files, dark).score;

  // Хотя бы одна из палитр должна дать иной вердикт по этой паре — иначе проверка
  // не зависит от палитры и бесполезна.
  const ratioLight = contrastRatio(light.palette.muted, light.palette.accent);
  const ratioDark = contrastRatio(dark.palette.muted, dark.palette.accent);
  if (ratioLight < TEXT_CONTRAST_MIN !== ratioDark < TEXT_CONTRAST_MIN) {
    assert.notEqual(a, b, 'балл зависит от фактической палитры проекта');
  } else {
    assert.equal(a, b, 'при одинаковом вердикте пары балл совпадает');
  }
});
