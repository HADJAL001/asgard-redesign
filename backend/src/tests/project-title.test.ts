import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveProjectTitle,
  resolveProjectTitle,
  FALLBACK_TITLE,
  MAX_TITLE_LENGTH,
} from '../lib/project-title';

/* ================================================================
   OSGARD · Название проекта из описания идеи (lib/project-title).

   Смысл модуля. «Первый клик создаёт проект»: человек описывает
   приложение словом или голосом, а название придумывает платформа.
   До этого поле «Название» было обязательным — описав идею, человек
   получал анкету, а лендинг отправлял ВСЮ фразу в качестве имени
   проекта (карточка, строка транзакции и имена стартовых артефактов
   получали предложение целиком).

   Тесты офлайновые и детерминированные — модуль не зовёт модель, это
   и есть доказательство, что имя не стоит ни токена, ни секунды.
   ================================================================ */

test('идея превращается в короткое имя, обращение к платформе отброшено', () => {
  assert.equal(
    deriveProjectTitle('сделай мне сайт кофейни с меню и бронированием'),
    'Сайт кофейни с меню и бронированием',
  );
  assert.equal(deriveProjectTitle('хочу трекер привычек'), 'Трекер привычек');
  assert.equal(deriveProjectTitle('нужен интернет-магазин кроссовок'), 'Интернет-магазин кроссовок');
  assert.equal(deriveProjectTitle('давай соберём дневник тренировок'), 'Соберём дневник тренировок');
});

test('несколько обращений подряд снимаются все', () => {
  assert.equal(deriveProjectTitle('пожалуйста сделай мне лендинг для пекарни'), 'Лендинг для пекарни');
  assert.equal(deriveProjectTitle('можешь создать блог о путешествиях'), 'Блог о путешествиях');
});

test('английский ввод разбирается так же', () => {
  assert.equal(deriveProjectTitle('build me a todo app with tags'), 'Todo app with tags');
  assert.equal(deriveProjectTitle('I want a landing page for my band'), 'Landing page for my band');
  assert.equal(deriveProjectTitle('please generate a habit tracker'), 'Habit tracker');
});

test('в имя идёт только первая фраза — остальное остаётся брифом', () => {
  assert.equal(
    deriveProjectTitle('Трекер расходов. Ещё нужна тёмная тема и экспорт в CSV'),
    'Трекер расходов',
  );
  assert.equal(deriveProjectTitle('Игра про космос! И чтобы был рейтинг'), 'Игра про космос');
  /* Голосовой ввод и вставка из заметок дают перевод строки вместо точки —
     без этого две мысли слиплись бы в одно имя. */
  assert.equal(deriveProjectTitle('Сайт фотографа\nпортфолио и цены'), 'Сайт фотографа');
});

test('длинное описание режется по границе слова, без повисшего предлога', () => {
  const title = deriveProjectTitle(
    'сделай приложение для учёта личных расходов с категориями и графиками по месяцам',
  );
  assert.ok(title.length <= MAX_TITLE_LENGTH, `имя длиннее предела: ${title.length}`);
  /* Обрезка не должна оставлять «…расходов с» — это обрыв на середине мысли. */
  assert.ok(!/\s(?:с|и|для|по|в|на)$/i.test(title), `повис предлог: «${title}»`);
  assert.ok(title.startsWith('Приложение для учёта'), `неожиданное начало: «${title}»`);
});

test('слово длиннее предела режется жёстко — пустое имя хуже обрезанного', () => {
  const title = deriveProjectTitle('a'.repeat(120));
  assert.equal(title.length, MAX_TITLE_LENGTH);
  assert.equal(title, 'A' + 'a'.repeat(MAX_TITLE_LENGTH - 1));
});

test('кавычки, маркеры списка и Markdown снимаются', () => {
  assert.equal(deriveProjectTitle('«Магазин цветов»'), 'Магазин цветов');
  assert.equal(deriveProjectTitle('- сайт визитка'), 'Сайт визитка');
  assert.equal(deriveProjectTitle('1. каталог книг'), 'Каталог книг');
  assert.equal(deriveProjectTitle('**дашборд продаж**'), 'Дашборд продаж');
});

test('мусор и пустота дают понятное имя, а не пустую строку', () => {
  for (const input of ['', '   ', '\n\n', '...', '???', '🙂🙂', null, undefined, 42 as any]) {
    assert.equal(deriveProjectTitle(input as any), FALLBACK_TITLE, `вход: ${JSON.stringify(input)}`);
  }
});

test('заданный человеком регистр не переписывается', () => {
  /* Заглавная внутри первого слова — признак осознанного написания: «iOS-трекер»
     не должен стать «IOS-трекером» из-за автоматической заглавной. */
  assert.equal(deriveProjectTitle('iOS-трекер сна'), 'iOS-трекер сна');
  assert.equal(deriveProjectTitle('приложение iOS для сна'), 'Приложение iOS для сна');
});

test('вывод детерминирован и идемпотентен', () => {
  const idea = 'сделай мне сервис бронирования переговорок с календарём на неделю';
  const once = deriveProjectTitle(idea);
  assert.equal(deriveProjectTitle(idea), once, 'один вход дал два разных имени');
  assert.equal(deriveProjectTitle(once), once, 'повторный вызов изменил уже выведенное имя');
});

test('«мне» снимается только перед просьбой', () => {
  assert.equal(deriveProjectTitle('мне нужен трекер сна'), 'Трекер сна');
  assert.equal(deriveProjectTitle('мне бы сделать каталог вин'), 'Каталог вин');
  /* Само по себе «мне» — часть мысли, а не обращение к платформе. Запятая
     границей фразы намеренно НЕ считается: «Трекер расходов, доходов и целей»
     потерял бы половину смысла. */
  assert.equal(deriveProjectTitle('мне нравится кофе'), 'Мне нравится кофе');
});

test('resolveProjectTitle: явное имя пользователя важнее выведенного', () => {
  assert.equal(resolveProjectTitle('Кофейня №1', 'сделай сайт кофейни'), 'Кофейня №1');
  assert.equal(resolveProjectTitle('  ', 'сделай сайт кофейни'), 'Сайт кофейни');
  assert.equal(resolveProjectTitle(undefined, 'трекер привычек'), 'Трекер привычек');
  assert.equal(resolveProjectTitle(null, null), FALLBACK_TITLE);
});
