import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "tools/**", "data/**", ".cache/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // With noUncheckedIndexedAccess, `xs[i]!` after a bounds check is the idiom.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
