const { login } = require('./helpers/auth');

describe('Вход в приложение', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('успешный логин демо-пользователем показывает экран «Создать артефакт»', async () => {
    await login('alex_odin', 'password123');

    await expect(element(by.text('Создать артефакт'))).toBeVisible();
  });

  it('неверный пароль показывает сообщение об ошибке и оставляет на экране логина', async () => {
    await waitFor(element(by.id('login-username-input')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('login-username-input')).typeText('alex_odin');
    await element(by.id('login-password-input')).typeText('wrong-password');
    await element(by.id('login-submit-button')).tap();

    await expect(element(by.id('login-error-message'))).toBeVisible();
    await expect(element(by.id('login-username-input'))).toBeVisible();
  });
});
