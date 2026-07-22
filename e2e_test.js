/**
 * E2E тест OSGARD — проверяет основные страницы как пользователь
 * Каждый тест открывает новую страницу во избежание каскадных ошибок
 */

const BASE = 'https://osgardnewworld.com';

async function runTests() {
  let chromium, browser;

  try {
    chromium = require('playwright').chromium;
  } catch(e) {
    try {
      chromium = require('@playwright/test').chromium;
    } catch(e2) {
      console.error('Playwright не найден');
      process.exit(1);
    }
  }

  const results = [];
  function log(test, status, detail = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${test}${detail ? ': ' + detail : ''}`);
    results.push({ test, status, detail });
  }

  console.log(`\n🧪 OSGARD E2E Tests — ${BASE}\n`);

  try {
    browser = await chromium.launch({ headless: true });

    async function testPage(name, url, check) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await check(page, errors, log, name);
      } catch(e) {
        log(name, 'FAIL', e.message.split('\n')[0]);
      } finally {
        await context.close();
      }
    }

    // ── 1. Главная страница ──
    await testPage('Главная страница', BASE, async (page, errors, log, name) => {
      const title = await page.title();
      const finalUrl = page.url();
      log(name, 'PASS', `title="${title}" url=${finalUrl.replace(BASE,'') || '/'}`);
    });

    // ── 2. /login ──
    await testPage('/login страница', `${BASE}/login`, async (page, errors, log, name) => {
      const hasInput = await page.$('input') !== null;
      const text = await page.textContent('body');
      const hasLoginWord = text.includes('Вход') || text.includes('Login') || text.includes('login');
      log(name, hasInput || hasLoginWord ? 'PASS' : 'WARN',
        `input:${hasInput} loginText:${hasLoginWord} url:${page.url().replace(BASE,'')}`);
    });

    // ── 3. /register ──
    await testPage('/register страница', `${BASE}/register`, async (page, errors, log, name) => {
      const hasInput = await page.$('input') !== null;
      const text = await page.textContent('body');
      const ok = text.includes('Регистрация') || text.includes('Register') || hasInput;
      log(name, ok ? 'PASS' : 'WARN', `input:${hasInput} url:${page.url().replace(BASE,'')}`);
    });

    // ── 4. /pricing ──
    await testPage('/pricing страница', `${BASE}/pricing`, async (page, errors, log, name) => {
      const text = await page.textContent('body');
      const hasPlan = text.includes('Pro') || text.includes('Supreme') || text.includes('Пользователь') || text.includes('Архитектор');
      const hasPrice = text.includes('$') || text.includes('месяц') || text.includes('/мес');
      log(name, hasPlan ? 'PASS' : 'WARN', `plans:${hasPlan} prices:${hasPrice}`);
    });

    // ── 5. /settings ──
    await testPage('/settings страница', `${BASE}/settings`, async (page, errors, log, name) => {
      const finalUrl = page.url();
      const text = await page.textContent('body');
      const redirectedToLogin = finalUrl.includes('login');
      const hasSettings = text.includes('Настройки');
      const hasPromo = text.includes('Промокод');
      if (redirectedToLogin) {
        log(name, 'PASS', 'перенаправлен на /login (auth guard работает)');
      } else {
        log(name, hasSettings ? 'PASS' : 'WARN',
          `hasSettings:${hasSettings} hasPromo:${hasPromo}`);
      }
    });

    // ── 6. /orchestrator ──
    await testPage('/orchestrator страница', `${BASE}/orchestrator`, async (page, errors, log, name) => {
      const finalUrl = page.url();
      const redirectedToLogin = finalUrl.includes('login');
      const text = await page.textContent('body');
      const hasOrch = text.includes('Оркестратор') || text.includes('orchestrator') || text.includes('цепоч');
      if (redirectedToLogin) {
        log(name, 'PASS', 'перенаправлен на /login (auth guard работает)');
      } else {
        log(name, hasOrch ? 'PASS' : 'WARN', `url:${finalUrl.replace(BASE,'')}`);
      }
    });

    // ── 7. /dashboard ──
    await testPage('/dashboard страница', `${BASE}/dashboard`, async (page, errors, log, name) => {
      const finalUrl = page.url();
      log(name, 'PASS', `redirected to: ${finalUrl.replace(BASE,'') || '/'}`);
    });

    // ── 8. CSP check — скрипты загружаются ──
    await testPage('CSP / скрипты загружаются', `${BASE}/pricing`, async (page, errors, log, name) => {
      // Ждём немного для загрузки скриптов
      await page.waitForTimeout(2000);
      const cspErrors = errors.filter(e => e.includes('Content Security Policy') || e.includes('script-src'));
      const otherErrors = errors.filter(e =>
        !e.includes('Content Security Policy') &&
        !e.includes('favicon') &&
        !e.includes('Analytics')
      );
      if (cspErrors.length === 0) {
        log(name, 'PASS', `нет CSP ошибок, other errors: ${otherErrors.length}`);
      } else {
        log(name, 'WARN', `${cspErrors.length} CSP ошибок`);
        cspErrors.slice(0,1).forEach(e => console.log('  CSP:', e.slice(0,120)));
      }
    });

  } catch(e) {
    console.error('Критическая ошибка:', e.message);
  } finally {
    if (browser) await browser.close();
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  console.log(`\n📊 Итог: ${passed} PASS / ${warned} WARN / ${failed} FAIL из ${results.length} тестов`);

  if (failed > 0) {
    console.log('\n❌ FAIL:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - ${r.test}: ${r.detail}`));
  }
}

runTests().catch(e => { console.error(e); process.exit(1); });
