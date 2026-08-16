import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessRequestClarity } from '../lib/request-clarity';

/* ================================================================
   OSGARD · «Я не понял запрос» (lib/request-clarity).

   Главный риск этой проверки — не пропуск, а ЛОЖНЫЙ ОТКАЗ: заявка
   живого человека, объявленная непонятной, останавливает работу того,
   кто всё сделал правильно. Поэтому негативный контроль здесь больше
   положительного: русский, английский, казахский, французский с
   диакритикой, эмодзи, аббревиатуры, одно слово — всё обязано пройти.
   ================================================================ */

/* ---- Положительный контроль: то, что действительно нечитаемо ---- */

test('битая кодировка (UTF-8 прочитан как Latin-1) — генерация не начинается', () => {
  // Ровно тот класс входа, что дал дашборд Kubernetes вместо лендинга 30.07.2026.
  const broken = 'ÐžÐ´Ð½Ð¾ÑÑ‚Ñ€Ð°Ð½Ð¸Ñ‡Ð½Ñ‹Ð¹ Ð»ÐµÐ½Ð´Ð¸Ð½Ð³';
  const verdict = assessRequestClarity({ hint: broken });

  assert.equal(verdict.clear, false);
  if (verdict.clear) return;
  assert.equal(verdict.reason, 'mojibake');
  // Человеку показываем и вопрос, и то, что реально дошло до сервера.
  assert.match(verdict.question, /кодировк/i);
  assert.ok(verdict.sample.length > 0);
});

test('символы замены — читать нечего', () => {
  const verdict = assessRequestClarity({ hint: 'сделай ��� приложение ���' });
  assert.equal(verdict.clear, false);
  if (!verdict.clear) assert.equal(verdict.reason, 'replacement-chars');
});

test('заявка без единого слова — знаки, цифры и эмодзи', () => {
  for (const hint of ['!!! ??? 123', '🙂🙂🙂', '...', '42']) {
    const verdict = assessRequestClarity({ hint });
    assert.equal(verdict.clear, false, `«${hint}» не может быть заявкой`);
    if (!verdict.clear) assert.equal(verdict.reason, 'no-words');
  }
});

test('пустой ввод — вердикт есть, исключения нет', () => {
  assert.equal(assessRequestClarity({}).clear, false);
  assert.equal(assessRequestClarity({ name: '   ', hint: null }).clear, false);
});

/* ---- НЕГАТИВНЫЙ КОНТРОЛЬ: живые заявки обязаны проходить ---- */

test('живые заявки на разных языках проходят без вопросов', () => {
  const real = [
    'одностраничный лендинг: заголовок, три преимущества, кнопка',
    'landing page for a coffee shop with menu and booking',
    'Тапсырыс беруге арналған қосымша: мәзір, себет, төлем',
    'application de réservation pour un café à Montréal',
    'CRM',
    'ИИ-коуч долголетия с планом питания и подпиской 9,99 €',
    'todo-приложение 📝 со списками и напоминаниями',
    'магазин с оплатой картой (Stripe) и админкой',
  ];

  for (const hint of real) {
    assert.equal(assessRequestClarity({ hint }).clear, true, `ложный отказ на живой заявке: «${hint}»`);
  }
});

test('название без описания — тоже понятная заявка', () => {
  assert.equal(assessRequestClarity({ name: 'Кофейня на углу' }).clear, true);
  assert.equal(assessRequestClarity({ name: 'VITALIS', hint: '' }).clear, true);
});

test('одиночная диакритика и редкие буквы не считаются поломкой', () => {
  // Ñ, Ã, é встречаются в живых языках — по одному символу отказ давать нельзя.
  assert.equal(assessRequestClarity({ hint: 'tienda de café en España con reservas' }).clear, true);
  assert.equal(assessRequestClarity({ hint: 'São Paulo delivery app com pagamento' }).clear, true);
  assert.equal(assessRequestClarity({ hint: 'приложение про птицу ñandú из Аргентины' }).clear, true);
});

test('детерминированность: один вход — один вердикт', () => {
  const input = { hint: 'ÐžÐ´Ð½Ð¾ÑÑ‚Ñ€Ð°Ð½Ð¸Ñ‡Ð½Ñ‹Ð¹ Ð»ÐµÐ½Ð´Ð¸Ð½Ð³' };
  const a = assessRequestClarity(input);
  const b = assessRequestClarity(input);
  assert.deepEqual(a, b);
});
