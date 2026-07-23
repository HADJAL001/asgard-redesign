const { login } = require('./helpers/auth');

describe('История артефактов', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await login('alex_odin', 'password123');
  });

  beforeEach(async () => {
    await device.reloadReactNative();
    await login('alex_odin', 'password123');
  });

  it('переход на вкладку «История» показывает список или пустое состояние', async () => {
    await element(by.text('История')).tap();

    await waitFor(element(by.id('history-list')))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('тап по элементу истории открывает экран артефакта', async () => {
    await element(by.text('История')).tap();
    await waitFor(element(by.id('history-list')))
      .toBeVisible()
      .withTimeout(15000);

    // Требует хотя бы одного ранее сгенерированного артефакта у демо-пользователя.
    await element(by.id('history-item')).atIndex(0).tap();

    await waitFor(element(by.text('Артефакт')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
