import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
    { ignores: ["dist", "node_modules", "data", "eslint.config.mjs"] },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            globals: globals.node,
            // "project" watches files on disk, so the editor stays in sync when files change outside it.
            parserOptions: { project: ["./tsconfig.json"], tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            eqeqeq: ["error", "always"],
            "no-console": "error",
            "no-duplicate-imports": "error",
            "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        },
    },
    {
        files: ["scripts/**"],
        rules: { "no-console": "off" },
    },
    {
        files: ["tests/**"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/require-await": "off",
        },
    },
);
