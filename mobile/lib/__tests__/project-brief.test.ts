import { buildProjectBrief, isProjectBriefAnswerComplete, isProjectBriefComplete } from '../project-brief';

describe('project brief', () => {
  const answers = {
    audience: 'владельцы кафе',
    outcome: 'оформить заказ за минуту',
    essentials: 'каталог, корзина, оплата',
    constraints: 'светлый стиль',
  };

  it('requires audience, outcome, and essentials before generation', () => {
    expect(isProjectBriefComplete(answers)).toBe(true);
    expect(isProjectBriefComplete({ ...answers, outcome: ' ' })).toBe(false);
    expect(isProjectBriefComplete({ ...answers, outcome: 'ok' })).toBe(false);
    expect(isProjectBriefAnswerComplete('goal')).toBe(true);
    expect(isProjectBriefAnswerComplete('x')).toBe(false);
  });

  it('builds the same structured brief as the web platform', () => {
    expect(buildProjectBrief('Приложение для кафе', answers)).toBe([
      'Приложение для кафе',
      'Аудитория: владельцы кафе',
      'Результат: оформить заказ за минуту',
      'Обязательные функции: каталог, корзина, оплата',
      'Ограничения: светлый стиль',
    ].join('\n'));
  });
});
