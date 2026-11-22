import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "node_modules/",
      "dist/",
      "acceptance/",
      ".orc/",
      "eslint.config.js",
      "vitest.config.ts",
    ],
  },
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-eval": "error",
      "no-new-func": "error",
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now" },
        { object: "performance", property: "now" },
        { object: "Math", property: "random" },
        { object: "crypto", property: "randomUUID" },
        { object: "process", property: "env" },
      ],
      "no-restricted-syntax": [
        "error",
        "NewExpression[callee.name='Date'][arguments.length=0]",
        "ImportExpression[source.type!='Literal']",
      ],
    },
  },
  {
    // Entry points and the config module may read the clock and the environment.
    files: ["apps/cli/src/main.ts", "apps/cli/src/config.ts"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": [
        "error",
        "ImportExpression[source.type!='Literal']",
      ],
    },
  },
);
