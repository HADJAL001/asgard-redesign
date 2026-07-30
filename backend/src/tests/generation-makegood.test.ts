import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Перегенерация за счёт платформы (lib/generation-makegood).

   ЧТО ЗДЕСЬ ЗАЩИЩАЕТСЯ. До этой волны неудачная генерация стоила
   пользователю столько же, сколько удачная: приложение не собиралось,
   а кредиты (или дневная квота) уже списаны, и «попробуйте снова» шло
   за его счёт. Платформа брала деньги за собственный промах.

   Механика компенсации опасна с двух сторон сразу, и тесты держат обе:

   • СО СТОРОНЫ ПОЛЬЗОВАТЕЛЯ — право не должно теряться: ни при сбое
     запуска, ради которого его списали, ни при повторной попытке.
   • СО СТОРОНЫ ЭКОНОМИКИ — право не должно размножаться: один провал
     даёт ровно одно право, повторный ремонт того же проекта — ни одного
     нового, а гонка двух запусков не может потратить одно право дважды.

   И ещё одно, самое тонкое: компенсация обязана СООТВЕТСТВОВАТЬ утрате.
   Провал быстрой генерации не даёт права на глубокую — иначе дешёвый
   провал конвертировался бы в дорогую генерацию, и выгоднее было бы
   ломать выдачу нарочно.
   ================================================================ */

let db: any;
let makegood: typeof import('../lib/generation-makegood');

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  /* Минимальная схема: таблица прав ссылается на users и projects (FK каскадом),
     поэтому обе нужны — иначе INSERT падал бы на FOREIGN KEY, а не на логике. */
  db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, plan TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER)`);
  await import('../migrations/099_generation_makegood');

  makegood = await import('../lib/generation-makegood');
});

beforeEach(() => {
  db.exec('DELETE FROM generation_makegoods');
  db.exec('DELETE FROM projects');
  db.exec('DELETE FROM users');
  db.prepare(`INSERT INTO users (id, plan) VALUES (1, 'free')`).run();
  db.prepare(`INSERT INTO users (id, plan) VALUES (2, 'free')`).run();
});

/** Проект пользователя — провалившаяся генерация, за которую положено право. */
function project(id: number, userId = 1): number {
  db.prepare(`INSERT INTO projects (id, user_id) VALUES (?, ?)`).run(id, userId);
  return id;
}

/* ---------------- выдача: один провал — одно право ---------------- */

test('провал выдачи даёт право на перегенерацию', () => {
  assert.equal(
    makegood.grantMakegood({ userId: 1, projectId: project(10), depth: 'standard', reason: 'broken' }),
    true,
  );

  const right = makegood.openMakegood(1);
  assert.equal(right?.projectId, 10);
  assert.equal(right?.depth, 'standard');
  assert.equal(right?.credits, 20, 'право помнит, во что обошлась провалившаяся глубина');
  assert.equal(right?.reason, 'broken');
});

test('повторный прогон того же проекта второго права не рождает', () => {
  const id = project(11);
  assert.equal(makegood.grantMakegood({ userId: 1, projectId: id, depth: 'deep', reason: 'broken' }), true);
  assert.equal(
    makegood.grantMakegood({ userId: 1, projectId: id, depth: 'deep', reason: 'unbuildable' }),
    false,
    'иначе кнопка «Починить» на сломанном проекте штамповала бы бесплатные генерации',
  );

  const { count } = db
    .prepare(`SELECT COUNT(*) as count FROM generation_makegoods WHERE user_id = 1`)
    .get() as { count: number };
  assert.equal(count, 1);
});

test('право принадлежит своему владельцу и чужому не видно', () => {
  makegood.grantMakegood({ userId: 1, projectId: project(12, 1), depth: 'standard', reason: 'broken' });
  assert.notEqual(makegood.openMakegood(1), null);
  assert.equal(makegood.openMakegood(2), null);
});

/* ---------------- соответствие компенсации утрате ---------------- */

test('провал быстрой генерации не оплачивает глубокую', () => {
  makegood.grantMakegood({ userId: 1, projectId: project(20), depth: 'quick', reason: 'broken' });

  assert.notEqual(makegood.findMakegoodFor(1, 'quick'), null);
  assert.equal(
    makegood.findMakegoodFor(1, 'deep'),
    null,
    'иначе ломать дешёвую выдачу нарочно было бы выгодной стратегией',
  );
  assert.equal(makegood.findMakegoodFor(1, 'standard'), null);
});

test('провал глубокой генерации покрывает любую глубину не дороже', () => {
  makegood.grantMakegood({ userId: 1, projectId: project(21), depth: 'deep', reason: 'crashed' });

  assert.notEqual(makegood.findMakegoodFor(1, 'deep'), null);
  assert.notEqual(makegood.findMakegoodFor(1, 'standard'), null);
  assert.notEqual(makegood.findMakegoodFor(1, 'quick'), null);
});

test('на дешёвый запуск уходит минимальное достаточное право, дорогое остаётся', () => {
  makegood.grantMakegood({ userId: 1, projectId: project(22), depth: 'deep', reason: 'broken' });
  makegood.grantMakegood({ userId: 1, projectId: project(23), depth: 'quick', reason: 'broken' });

  const forQuick = makegood.findMakegoodFor(1, 'quick');
  assert.equal(forQuick?.projectId, 23, 'иначе компенсация за дорогой провал сгорала бы на бесплатном запуске');

  assert.ok(makegood.consumeMakegood(forQuick!.id, 99));
  assert.equal(makegood.findMakegoodFor(1, 'deep')?.projectId, 22, 'дорогое право дождалось дорогого запуска');
});

/* ---------------- расход: ровно один раз ---------------- */

test('право тратится один раз — гонка двух запусков не удваивает бесплатное', () => {
  const id = project(30);
  makegood.grantMakegood({ userId: 1, projectId: id, depth: 'standard', reason: 'broken' });
  const right = makegood.findMakegoodFor(1, 'standard')!;

  assert.equal(makegood.consumeMakegood(right.id, 100), true);
  assert.equal(
    makegood.consumeMakegood(right.id, 101),
    false,
    'второй запуск обязан заплатить обычным порядком, а не получить генерацию даром',
  );
  assert.equal(makegood.findMakegoodFor(1, 'standard'), null);
});

test('израсходованное право помнит, на что потрачено — компенсация прослеживаема', () => {
  makegood.grantMakegood({ userId: 1, projectId: project(31), depth: 'standard', reason: 'broken' });
  const right = makegood.findMakegoodFor(1, 'standard')!;
  makegood.consumeMakegood(right.id, null);
  makegood.attachMakegoodProject(right.id, 555);

  const row = db
    .prepare(`SELECT consumed_at as consumedAt, consumed_project_id as consumedProjectId FROM generation_makegoods WHERE id = ?`)
    .get(right.id) as { consumedAt: number | null; consumedProjectId: number | null };

  assert.ok(row.consumedAt && row.consumedAt > 0);
  assert.equal(row.consumedProjectId, 555);
});

test('сбой запуска возвращает право владельцу', () => {
  makegood.grantMakegood({ userId: 1, projectId: project(32), depth: 'deep', reason: 'crashed' });
  const right = makegood.findMakegoodFor(1, 'deep')!;
  makegood.consumeMakegood(right.id, null);
  assert.equal(makegood.findMakegoodFor(1, 'deep'), null);

  makegood.releaseMakegood(right.id);
  assert.equal(
    makegood.findMakegoodFor(1, 'deep')?.id,
    right.id,
    'иначе платформа промахнулась бы дважды и оба раза за счёт пользователя',
  );
});

/* ---------------- безвредность ---------------- */

test('каждая причина промаха имеет формулировку от лица платформы', () => {
  for (const reason of ['broken', 'unbuildable', 'crashed'] as const) {
    const text = makegood.MAKEGOOD_REASON_TEXT[reason];
    assert.ok(text && text.length > 10, `причина «${reason}» должна объяснять человеку, за что компенсация`);
  }
});

test('несуществующее право не ломает вызов, а честно отвечает «нет»', () => {
  assert.equal(makegood.consumeMakegood(999_999, null), false);
  assert.equal(makegood.findMakegoodFor(1, 'quick'), null);
  assert.equal(makegood.openMakegood(1), null);
  /* releaseMakegood по чужому id — no-op, а не исключение: компенсация не имеет права
     ронять маршрут генерации. */
  makegood.releaseMakegood(999_999);
});
