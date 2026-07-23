#!/usr/bin/env node
/*
 * ESLint 8.57+ auto-detects the repo-root eslint.config.mjs (flat config,
 * used by the Next.js app) and silently switches to flat mode, which
 * ignores this package entirely (root config has `ignores: ['mobile/**']`).
 * Force legacy mode so mobile/.eslintrc.js is actually used.
 */
process.env.ESLINT_USE_FLAT_CONFIG = "false";

const { spawnSync } = require("child_process");
const result = spawnSync("npx", ["expo", "lint", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
process.exit(result.status ?? 1);
