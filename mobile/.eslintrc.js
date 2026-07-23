// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*'],
  overrides: [
    {
      files: ['e2e/**/*.js'],
      env: { node: true, jest: true },
      globals: {
        device: 'readonly',
        element: 'readonly',
        by: 'readonly',
        waitFor: 'readonly',
      },
    },
    {
      files: ['scripts/**/*.js'],
      env: { node: true },
    },
  ],
};
