import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Инженерный вердикт как допуск к публикации (lib/engineering-gate).

   Что доказываем — ровно то, что вскрыл выстрел 30.07.2026 (деплой 82):
     1. Приложение с вердиктом broken требует осознанного подтверждения,
        а не просто едет в интернет по клику.
     2. НЕГАТИВНЫЙ КОНТРОЛЬ: чистое, непроверенное и вовсе не имеющее
        вердикта приложение гейт НЕ трогает — проверка, срабатывающая
        всегда, ничего не проверяет.
     3. Провал НАСТОЯЩЕЙ сборки (кластер) переводит проект в broken,
        не затирая уже накопленный отчёт: после публикации студия обязана
        перестать показывать «проверено».
     4. Отсутствие колонок 091 (старая схема) не роняет ни гейт, ни запись.
   ================================================================ */

let db: any;
let gate: typeof import('../lib/engineering-gate');

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      build_status TEXT,
      build_report TEXT,
      build_verified_at INTEGER,
      design_score REAL
    );
  `);

  gate = await import('../lib/engineering-gate');
});

test('release readiness requires sandbox build evidence and premium design score', () => {
  const staticOnly = insertProject({ verdict: 'passed', report: { verifiedBy: 'static' }, designScore: 90 });
  assert.deepEqual(gate.readReleaseReadiness(staticOnly), {
    ready: false,
    code: 'build_not_verified',
    message: 'Перед публикацией нужна успешная реальная сборка в изолированной среде.',
  });

  const noDesign = insertProject({ verdict: 'passed', report: { verifiedBy: 'sandbox' } });
  assert.equal(gate.readReleaseReadiness(noDesign).code, 'design_not_verified');

  const weakDesign = insertProject({ verdict: 'passed', report: { verifiedBy: 'sandbox' }, designScore: 79 });
  assert.equal(gate.readReleaseReadiness(weakDesign).code, 'design_below_standard');

  const ready = insertProject({ verdict: 'passed', report: { verifiedBy: 'sandbox' }, designScore: 80 });
  assert.deepEqual(gate.readReleaseReadiness(ready), { ready: true, code: null, message: null });

  const broken = insertProject({ verdict: 'broken', report: { verifiedBy: 'sandbox' }, designScore: 100 });
  assert.equal(gate.readReleaseReadiness(broken).code, 'build_broken');
});

function insertProject(input: { verdict?: string | null; report?: unknown; designScore?: number | null }): number {
  const info = db
    .prepare(`INSERT INTO projects (user_id, name, build_status, build_report, design_score) VALUES (1, 'app', ?, ?, ?)`)
    .run(input.verdict ?? null, input.report === undefined ? null : JSON.stringify(input.report), input.designScore ?? null);
  return Number(info.lastInsertRowid);
}

test('broken: гейт видит вердикт, число дефектов и правила', () => {
  const id = insertProject({
    verdict: 'broken',
    report: {
      verifiedBy: 'static',
      defects: [
        { rule: 'prop-unknown', severity: 'error', file: 'app/nodes/page.tsx', message: '...' },
        { rule: 'prop-type-mismatch', severity: 'error', file: 'app/pods/page.tsx', message: '...' },
        { rule: 'style-nit', severity: 'warn', file: 'app/page.tsx', message: '...' },
      ],
    },
  });

  const g = gate.readEngineeringGate(id);
  assert.equal(g.verdict, 'broken');
  // Предупреждения не считаются дефектами, из-за которых нельзя публиковать.
  assert.equal(g.errorDefects, 2);
  assert.deepEqual(g.rules, ['prop-unknown', 'prop-type-mismatch']);

  assert.equal(gate.deployNeedsAcknowledgement(g), true);
  const text = gate.describeBrokenGate(g);
  assert.match(text, /2/);
  assert.match(text, /prop-unknown/);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: passed / repaired / unverified / без вердикта — публикацию не блокируем', () => {
  for (const verdict of ['passed', 'repaired', 'unverified', null]) {
    const id = insertProject({ verdict, report: { defects: [] } });
    const g = gate.readEngineeringGate(id);
    assert.equal(
      gate.deployNeedsAcknowledgement(g),
      false,
      `вердикт ${String(verdict)} не должен требовать подтверждения`,
    );
  }
});

test('битый JSON отчёта не отменяет сам вердикт', () => {
  const info = db
    .prepare(`INSERT INTO projects (user_id, name, build_status, build_report) VALUES (1, 'app', 'broken', ?)`)
    .run('{не json');
  const g = gate.readEngineeringGate(Number(info.lastInsertRowid));
  assert.equal(g.verdict, 'broken');
  assert.equal(g.errorDefects, 0);
  assert.equal(gate.deployNeedsAcknowledgement(g), true);
});

test('провал реальной сборки переводит проект в broken и сохраняет прежний отчёт', () => {
  const id = insertProject({
    verdict: 'passed',
    report: {
      verifiedBy: 'static',
      checks: [{ key: 'imports', label: 'Импорты', passed: true, errors: 0, detail: '' }],
      defects: [],
    },
  });

  gate.recordRealBuildFailure(id, {
    source: 'cluster',
    status: 'build_failed',
    message: "TypeError: Cannot destructure property 'data' of 'undefined'",
    at: 1_700_000_000_000,
  });

  const row = db.prepare(`SELECT build_status, build_report, build_verified_at FROM projects WHERE id = ?`).get(id);
  assert.equal(row.build_status, 'broken');
  assert.equal(row.build_verified_at, 1_700_000_000_000);

  const report = JSON.parse(row.build_report);
  assert.equal(report.verifiedBy, 'real-build');
  assert.equal(report.realBuild.ok, false);
  assert.equal(report.realBuild.source, 'cluster');
  assert.equal(report.realBuild.status, 'build_failed');
  assert.match(report.realBuild.message, /Cannot destructure/);
  // Накопленное не затираем: разбор остаётся на месте.
  assert.equal(report.checks.length, 1);

  // И теперь гейт закрыт: то же приложение больше не публикуется по клику.
  assert.equal(gate.deployNeedsAcknowledgement(gate.readEngineeringGate(id)), true);
});

test('схема без колонок 091 не ломает ни чтение гейта, ни запись вердикта', () => {
  db.exec(`
    CREATE TABLE projects_legacy AS SELECT id, user_id, name, status FROM projects;
    DROP TABLE projects;
    ALTER TABLE projects_legacy RENAME TO projects;
  `);

  const id = Number(
    db.prepare(`INSERT INTO projects (user_id, name, status) VALUES (1, 'legacy', 'ready')`).run().lastInsertRowid,
  );

  const g = gate.readEngineeringGate(id);
  assert.equal(g.verdict, null);
  assert.equal(gate.deployNeedsAcknowledgement(g), false);

  // Не бросает — деплой из-за отсутствия колонок не падает.
  assert.doesNotThrow(() =>
    gate.recordRealBuildFailure(id, { source: 'host', status: 'build_failed', message: 'x' }),
  );
});
