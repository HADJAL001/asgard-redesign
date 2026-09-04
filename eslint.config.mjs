import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'backend/**', 'mobile/**', 'playwright-report/**', 'test-results/**', '**/*.backup.tsx', 'eternity-landing-backup.tsx'],
  },
];

export default config;
