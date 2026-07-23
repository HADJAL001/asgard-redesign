const { login } = require('./helpers/auth');

describe('Генерация артефакта', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await login('alex_odin', 'password123');
  });

  beforeEach(async () => {
    await device.reloadReactNative();
    await login('alex_odin', 'password123');
  });

  it('заполняет описание и создаёт артефакт, переходя на экран результата', async () => {
    await expect(element(by.id('create-description-input'))).toBeVisible();

    await element(by.id('create-description-input')).typeText('Древний меч из тумана времени');
    await element(by.id('create-generate-button')).tap();

    // Пуш "charging" -> "burst" -> "reveal" анимация в GenerationProgress,
    // затем переход на модальный экран /result/[id] — ждём заголовок экрана.
    await waitFor(element(by.text('Артефакт')))
      .toBeVisible()
      .withTimeout(20000);
  });
});
