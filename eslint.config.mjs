import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // These React 19 advisory rules flag several existing client-side sync patterns
      // that do not block Next.js production builds in this app.
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    "out/**",
    "build/**",
    "build-package-temp/**",
    "deploy-package/**",
    "final-upload/**",
    "final-upload.zip",
    "worklog-ultra-app/**",
    "worklog-ultra-deploy/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
