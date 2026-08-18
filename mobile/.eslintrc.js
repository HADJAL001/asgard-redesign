// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*', '__tests__/vpn.e2e.test.ts', 'scripts/vpn-test.ts', 'lib/gard-api.ts', 'hooks/useServers.ts'],
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
