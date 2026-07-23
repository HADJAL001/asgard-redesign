/**
 * Общий хелпер логина для e2e-сценариев.
 *
 * На момент написания экран `app/(auth)/login.tsx` в репозитории ещё не создан
 * (его должен добавить другой инстанс — навигация на него уже объявлена в
 * `app/(auth)/_layout.tsx`), поэтому здесь зафиксирован ожидаемый testID-контракт,
 * которому экран логина должен соответствовать:
 *   - testID="login-username-input"
 *   - testID="login-password-input"
 *   - testID="login-submit-button"
 * Демо-пользователь backend: alex_odin / password123 (см. backend/README).
 */
async function login(username = 'alex_odin', password = 'password123') {
  await waitFor(element(by.id('login-username-input')))
    .toBeVisible()
    .withTimeout(15000);

  await element(by.id('login-username-input')).typeText(username);
  await element(by.id('login-password-input')).typeText(password);
  await element(by.id('login-submit-button')).tap();

  // После успешного логина приложение переходит на вкладку «Создать».
  await waitFor(element(by.text('Создать артефакт')))
    .toBeVisible()
    .withTimeout(15000);
}

module.exports = { login };
