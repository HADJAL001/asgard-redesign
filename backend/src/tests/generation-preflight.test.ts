import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Взгляд до генерации (волна 7, п.4)

   До этой волны платформа не смотрела на заявку до кодогенерации
   вообще: проверялось «имя ИЛИ идея непусты», тема выбиралась по
   словарю из восьми настроений, а первый осмысленный взгляд случался
   ВНУТРИ генерации — когда время и деньги уже потрачены.

   Здесь проверяется не «функция вернула объект», а свойства, без
   которых взгляд наперёд был бы вредным:

   — КЛАСС ≠ ТЕМА. Два проекта одной темы («фэнтези») получают разные
     классы, если один магазин, а другой чат: класс выводится из
     названных возможностей, а не из настроения текста.
   — ПОХОЖЕСТЬ ИЩЕТСЯ ПО КЛАССУ, и исходы прошлых генераций
     возвращаются фактом: собралось / сломалось / задеплоено /
     просили переделать.
   — НЕГАТИВНЫЙ КОНТРОЛЬ ПРИВАТНОСТИ: чужие заявки участвуют в
     счёте и НЕ уходят наружу ни одной строкой. Показать чужое
     название рядом с «похоже на ваш замысел» — утечка замысла.
   — НЕГАТИВНЫЙ КОНТРОЛЬ ВЫДУМКИ: ниже трёх похожих генераций доли не
     считаются вовсе (`null`), а не показываются как «100%
     переделывают» по одному случаю.
   — НЕГАТИВНЫЙ КОНТРОЛЬ «НЕ ЗНАЮ»: заявка из декоративных слов не
     получает класса. Выдуманный класс хуже отсутствующего: под него
     платформа найдёт «похожие» генерации и ответит уверенно, ни на
     чём не основываясь.
   — НЕГАТИВНЫЙ КОНТРОЛЬ ЗАПРЕТА ДОСКИ: за весь разбор не делается ни
     одного сетевого вызова — стоимость и время генерации расти не
     должны.
   — НЕГАТИВНЫЙ КОНТРОЛЬ СХЕМЫ: без миграции 101 взгляд назад
     невозможен, но взгляд на заявку остаётся, и роняться нечему.
   ================================================================ */

let db: any;
let pre: typeof import('../lib/generation-preflight');
let product: typeof import('../lib/product-class');
let migration: typeof import('../migrations/101_product_class');

const ME = 1;
const STRANGER = 2;

type PutProject = {
  name: string;
  description?: string | null;
  userId?: number;
  verdict?: string | null;
  deployed?: boolean;
  refinements?: number;
  /** По умолчанию класс выводится тем же кодом, что и для новой заявки. */
  cls?: string | null;
};

let seq = 0;

/** Прошлая генерация: заявка + её исход. Класс пишется так же, как его пишет генерация. */
function putProject(params: PutProject): number {
  seq += 1;
  const cls =
    params.cls === undefined ? product.classifyProduct(params.name, params.description ?? null).cls : params.cls;

  const info = db
    .prepare(
      `INSERT INTO projects (user_id, name, description, build_status, deploy_status, product_class, product_capabilities, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', ?)`,
    )
    .run(
      params.userId ?? ME,
      params.name,
      params.description ?? null,
      params.verdict ?? null,
      params.deployed ? 'deployed' : null,
      cls,
      seq,
    );

  const id = Number(info.lastInsertRowid);
  for (let i = 0; i < (params.refinements ?? 0); i += 1) {
    db.prepare(
      `INSERT INTO project_refinements (user_id, project_id, prompt, status, cost_credits, created_at)
       VALUES (?, ?, 'переделай', 'ready', 0, 1)`,
    ).run(params.userId ?? ME, id);
  }
  return id;
}

const SHOP = 'интернет-магазин с каталогом товаров, корзиной и оплатой картой, цена в рублях';
const CHAT = 'чат для команды: сообщения в реальном времени, вход по паролю, профили участников';

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      build_status TEXT,
      deploy_status TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE project_refinements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      cost_credits INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  product = await import('../lib/product-class');
  migration = await import('../migrations/101_product_class');
  pre = await import('../lib/generation-preflight');
});

beforeEach(() => {
  db.exec(`DELETE FROM projects; DELETE FROM project_refinements;`);
});

/* ---------------- (а) класс продукта, а не тема ---------------- */

test('класс выводится из названных возможностей, а не из настроения текста', () => {
  const shop = product.classifyProduct('Драконий базар', SHOP);
  const chat = product.classifyProduct('Драконий совет', CHAT);

  assert.equal(shop.cls, 'catalog-commerce');
  assert.equal(chat.cls, 'realtime-chat');
  assert.notEqual(shop.cls, chat.cls, 'одна тема «драконы» — разные продукты, и класс обязан их различать');
  assert.ok(shop.capabilities.includes('payments') && shop.capabilities.includes('catalog'));
  assert.ok(shop.evidence.length > 0, 'ответ обязан быть проверяемым: видно, по каким словам решили');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: декоративная заявка класса НЕ получает', () => {
  const match = product.classifyProduct('Мир магии', 'фэнтези, драконы, тёмная магия, красивый минимализм');

  assert.equal(match.cls, 'unknown', 'выдуманный класс хуже отсутствующего');
  assert.equal(match.decorativeOnly, true);
  assert.deepEqual(match.capabilities, [], 'ни одной возможности не названо — и придумывать их нельзя');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ основания: «оплата картой» — не карта местности', () => {
  /* Дефект найден ЖИВЫМ прострелом маршрута, а не этим набором: класс выходил верный
     (catalog-commerce), поэтому все проверки класса оставались зелёными — а человеку
     при этом показывалось слово-основание «карт» рядом с возможностью «карта».
     Ложное основание опаснее отсутствующего: оно выглядит как доказательство. */
  const shop = product.classifyProduct('Магазин', 'каталог товаров, корзина, оплата картой');
  assert.ok(!shop.capabilities.includes('geo-map'), 'банковская карта — не гео');
  assert.ok(!shop.evidence.includes('карт'), 'нельзя показывать «карт» как довод за гео');

  /* Обратная сторона: настоящее гео опознаваться обязано, иначе «починка» свелась бы
     к молчанию словаря. */
  const geo = product.classifyProduct('Точки на карте', 'каталог мастерских, показать на карте, маршрут и адрес');
  assert.ok(geo.capabilities.includes('geo-map'), 'настоящее гео обязано опознаваться');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: возможности без предмета класса не дают', () => {
  /* Названы поиск и загрузка файлов, но не сказано, ЧТО искать и зачем — определяющей
     возможности нет ни у одного класса, кроме инструмента, который эти слова и описывают. */
  const vague = product.classifyProduct('Штука', 'поиск и фильтры, сортировка');
  assert.equal(vague.cls, 'unknown');
});

/* ---------------- (б) похожие прошлые генерации и чем кончились ---------------- */

test('похожесть ищется по классу, исходы прошлых генераций возвращаются фактом', () => {
  putProject({ name: 'Лавка 1', description: SHOP, verdict: 'passed', deployed: true });
  putProject({ name: 'Лавка 2', description: SHOP, verdict: 'repaired', refinements: 2 });
  putProject({ name: 'Лавка 3', description: SHOP, verdict: 'broken', refinements: 1 });
  /* Другой класс в той же базе — в счёт попадать не должен. */
  putProject({ name: 'Болталка', description: CHAT, verdict: 'passed', deployed: true });

  const view = pre.preflight({ userId: ME, name: 'Новая лавка', hint: SHOP });

  assert.equal(view.cls, 'catalog-commerce');
  assert.equal(view.measured, true);
  assert.equal(view.similar.total, 3, 'чат в похожие магазины не попал');
  assert.equal(view.similar.passed, 1);
  assert.equal(view.similar.repaired, 1);
  assert.equal(view.similar.broken, 1);
  assert.equal(view.similar.deployed, 1);
  assert.equal(view.similar.refined, 2);
  assert.equal(view.similar.deployedShare, 0.33, 'три случая — порог фактов пройден');
  assert.equal(view.similar.refinedShare, 0.67);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: ниже порога фактов доли не считаются вовсе', () => {
  putProject({ name: 'Лавка 1', description: SHOP, verdict: 'broken', refinements: 1 });
  putProject({ name: 'Лавка 2', description: SHOP, verdict: 'broken', refinements: 1 });

  const view = pre.preflight({ userId: ME, name: 'Новая лавка', hint: SHOP });

  assert.equal(view.similar.total, 2, 'сами исходы показать честно — их два');
  assert.equal(view.similar.brokenShare, null, '«100% ломается» по двум случаям было бы выдумкой');
  assert.equal(view.similar.refinedShare, null);
  assert.equal(view.similar.deployedShare, null);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ приватности: чужая заявка считается, но наружу не уходит', () => {
  putProject({ name: 'СЕКРЕТНЫЙ ЗАМЫСЕЛ ЧУЖОГО', description: SHOP, userId: STRANGER, verdict: 'passed', deployed: true });
  putProject({ name: 'Моя лавка', description: SHOP, verdict: 'repaired' });

  const view = pre.preflight({ userId: ME, name: 'Новая лавка', hint: SHOP });
  const payload = JSON.stringify(view);

  assert.equal(view.similar.total, 2, 'чужая генерация участвует в счёте — иначе фактов почти не будет');
  assert.equal(view.similar.deployed, 1, 'и её исход тоже учтён');
  assert.ok(!payload.includes('СЕКРЕТНЫЙ'), 'чужое название наружу не уходит ни одной строкой');
  assert.deepEqual(
    view.similar.ownExamples.map((e) => e.name),
    ['Моя лавка'],
    'назвать можно только собственные проекты человека',
  );
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: по неопределённому классу похожесть не ищется', () => {
  /* В базе есть проекты без определённой функции. Искать по ним похожесть значило бы
     склеить всё, о чём люди не договорили, в один «класс». */
  putProject({ name: 'Мир магии 1', description: 'фэнтези, драконы', verdict: 'passed', deployed: true });
  putProject({ name: 'Мир магии 2', description: 'магия и тьма', verdict: 'passed', deployed: true });
  putProject({ name: 'Мир магии 3', description: 'красиво про драконов', verdict: 'passed', deployed: true });

  const view = pre.preflight({ userId: ME, name: 'Ещё магия', hint: 'фэнтези, магия' });

  assert.equal(view.cls, 'unknown');
  assert.equal(view.similar.total, 0, 'по «не знаю» похожего не бывает');
  assert.equal(view.measured, false, 'и это честная пустота, а не ноль процентов');
});

test('собственные примеры показываются с исходом и не превращаются в список проектов', () => {
  /* Пятая — самая свежая: примеры берутся сверху списка, отсортированного по времени. */
  for (let i = 1; i <= 5; i += 1) {
    putProject({ name: `Моя лавка ${i}`, description: SHOP, verdict: 'passed', deployed: i === 5, refinements: i });
  }

  const view = pre.preflight({ userId: ME, name: 'Новая лавка', hint: SHOP });

  assert.equal(view.similar.total, 5);
  assert.equal(view.similar.ownExamples.length, 3, 'примеров ровно три: список проектов у человека и так есть');
  assert.deepEqual(
    view.similar.ownExamples.map((e) => e.name),
    ['Моя лавка 5', 'Моя лавка 4', 'Моя лавка 3'],
    'показываются свежие: вывод из позапрошлого корпуса говорит о прошлой платформе',
  );
  assert.ok(view.similar.ownExamples.every((e) => typeof e.outcome.refinements === 'number'));
  assert.ok(view.similar.ownExamples.some((e) => e.outcome.deployed), 'исход у примера настоящий, а не заглушка');
});

/* ---------------- (в) что не определено и чем грозит ---------------- */

test('пробелы заявки называются вместе со следствием, а не как выговор', () => {
  const gaps = pre.findBriefGaps('Магазин', 'магазин с оплатой картой');
  const kinds = gaps.map((g) => g.kind);

  assert.ok(kinds.includes('payments-without-auth'), 'деньги без входа — главный пробел такой заявки');
  assert.ok(kinds.includes('payments-without-price'), 'цена и валюта не названы');
  assert.ok(
    gaps.every((g) => g.what.length > 0 && g.risk.length > 0),
    'каждый пробел обязан объяснять, чем он грозит: иначе это придирка',
  );
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: полная заявка пробелов не набирает', () => {
  const gaps = pre.findBriefGaps('Лавка', SHOP);
  const kinds = gaps.map((g) => g.kind);

  assert.ok(!kinds.includes('unknown-class'), 'класс определён');
  assert.ok(!kinds.includes('too-short'), 'заявка достаточно подробная');
  assert.ok(!kinds.includes('data-undefined'), 'сказано, что хранить: каталог товаров');
  assert.ok(!kinds.includes('payments-without-price'), 'цена в рублях названа');
});

test('пробел подкрепляется фактом: чем кончились прошлые генерации С ТЕМ ЖЕ пробелом', () => {
  /* Три прошлые заявки того же класса и с тем же пробелом (деньги без входа). */
  for (let i = 1; i <= 3; i += 1) {
    putProject({ name: `Лавка ${i}`, description: 'магазин с каталогом и оплатой', refinements: 2, verdict: 'broken' });
  }
  /* И одна заявка того же класса, где вход НАЗВАН, — то есть без этого пробела.
     Она обязана попасть в похожие генерации и не попасть в факт по пробелу. */
  putProject({ name: 'Хорошая лавка', description: `${SHOP}, вход по паролю`, verdict: 'passed', deployed: true });

  const view = pre.preflight({ userId: ME, name: 'Ещё лавка', hint: 'магазин с каталогом и оплатой' });
  const gap = view.gaps.find((g) => g.kind === 'payments-without-auth');

  assert.equal(view.similar.total, 4, 'похожими считаются все четыре генерации класса');
  assert.ok(gap, 'пробел найден');
  assert.ok(gap!.fact, 'и подкреплён фактом, а не мнением');
  assert.equal(gap!.fact!.sameGap, 3, 'а в факт вошли только три — те, у которых пробел тот же');
  assert.equal(gap!.fact!.refined, 3);
  assert.equal(gap!.fact!.broken, 3);
  assert.equal(gap!.fact!.deployed, 0);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: два случая фактом не объявляются', () => {
  for (let i = 1; i <= 2; i += 1) {
    putProject({ name: `Лавка ${i}`, description: 'магазин с каталогом и оплатой', refinements: 2 });
  }

  const view = pre.preflight({ userId: ME, name: 'Ещё лавка', hint: 'магазин с каталогом и оплатой' });
  const gap = view.gaps.find((g) => g.kind === 'payments-without-auth');

  assert.ok(gap, 'пробел всё равно называется — он выводится из заявки, а не из истории');
  assert.equal(gap!.fact, null, 'а вот факта нет, и витрина обязана сказать это прямо');
});

test('пустая заявка: платформа отвечает «не знаю» и говорит, чего не хватает', () => {
  const view = pre.preflight({ userId: ME, name: '', hint: '' });

  assert.equal(view.cls, 'unknown');
  assert.ok(view.gaps.some((g) => g.kind === 'unknown-class'));
  assert.ok(view.gaps.some((g) => g.kind === 'too-short'));
  assert.equal(view.measured, false);
});

/* ---------------- запрет доски: ни одного вызова модели ---------------- */

test('НЕГАТИВНЫЙ КОНТРОЛЬ доски: за весь разбор не сделано ни одного сетевого вызова', async () => {
  for (let i = 1; i <= 4; i += 1) putProject({ name: `Лавка ${i}`, description: SHOP, verdict: 'passed' });

  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (...args: any[]) => {
    calls += 1;
    return realFetch(...(args as [any, any]));
  }) as typeof fetch;

  try {
    const view = pre.preflight({ userId: ME, name: 'Новая лавка', hint: SHOP });
    assert.equal(view.similar.total, 4, 'разбор реально произошёл, а не был пропущен');
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(calls, 0, 'стоимость и время генерации расти не должны — здесь нечего вызывать');
});

/* ---------------- витрина и схема ---------------- */

test('витрина показывает, у скольких проектов класс выведен и по скольким классам есть факты', () => {
  for (let i = 1; i <= 3; i += 1) putProject({ name: `Лавка ${i}`, description: SHOP, verdict: 'passed' });
  putProject({ name: 'Болталка', description: CHAT });
  putProject({ name: 'Мир магии', description: 'фэнтези и драконы' });

  const report = pre.foresightReport();

  assert.equal(report.projects, 5);
  assert.equal(report.classified, 5);
  assert.equal(report.unknownClass, 1, 'заявка без функции видна отдельно от «класс не выводили»');
  assert.equal(report.classesWithFacts, 1, 'фактов хватает только на магазины: у чата один случай');
  assert.equal(report.classifiedShare, 1);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ витрины: пустая база даёт null, а не ноль процентов', () => {
  const report = pre.foresightReport();

  assert.equal(report.projects, 0);
  assert.equal(report.classifiedShare, null, '«проектов нет» и «класс не выводится ни у кого» — разные факты');
  assert.equal(report.classesWithFacts, 0);
  assert.deepEqual(report.byClass, []);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ схемы: без миграции 101 взгляд на заявку остаётся, падать нечему', () => {
  putProject({ name: 'Лавка', description: SHOP, verdict: 'passed' });

  /* Переименование, а не удаление: колонка исчезает для всех запросов ровно так же, но
     схему можно вернуть следующим тестам без пересоздания таблицы. */
  db.exec(`DROP INDEX IF EXISTS idx_projects_product_class`);
  db.exec(`ALTER TABLE projects RENAME COLUMN product_class TO product_class_gone`);

  try {
    const view = pre.preflight({ userId: ME, name: 'Новая лавка', hint: SHOP });

    assert.equal(view.cls, 'catalog-commerce', 'класс — чистая функция, база ему не нужна');
    assert.ok(
      view.gaps.some((g) => g.kind === 'payments-without-auth'),
      'пробелы тоже выводятся из заявки, а не из базы',
    );
    assert.equal(view.gaps.find((g) => g.kind === 'payments-without-auth')!.fact, null, 'а факта без базы нет');
    assert.equal(view.similar.total, 0, 'взгляда назад нет — и он честно пуст');
    assert.equal(view.measured, false);

    const report = pre.foresightReport();
    assert.equal(report.classifiedShare, null, 'витрина честно пустая, а не сломанная');
  } finally {
    db.exec(`ALTER TABLE projects RENAME COLUMN product_class_gone TO product_class`);
    migration.runProductClassMigration();
  }
});
