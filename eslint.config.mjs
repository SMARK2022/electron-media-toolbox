import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import eslintPluginPrettierRecommended from "eslint-config-prettier";
import reactCompiler from "eslint-plugin-react-compiler";
import path from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prettierIgnorePath = path.resolve(__dirname, ".prettierignore");

/** @type {import("eslint").Linter.Config[]} */
export default [
  includeIgnoreFile(prettierIgnorePath),
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      "react-compiler": reactCompiler,
    },
    rules: {
      "react-compiler/react-compiler": "error",
    },
  },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  // tsconfig 已启用 jsx:"react-jsx" 自动运行时，无需在每个文件 import React；
  // 改用 jsx-runtime 预设可关闭 react/react-in-jsx-scope 与 react/jsx-uses-react
  pluginReact.configs.flat["jsx-runtime"],
  eslintPluginPrettierRecommended,
  ...tseslint.configs.recommended,
  // TS/TSX 文件已由 TS 编译器对 props 做静态类型校验，
  // react/prop-types 与 react/display-name 是为 JS 设计的规则，在 TS 下纯属误报
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "react/prop-types": "off",
      "react/display-name": "off",
    },
  },
  // CommonJS 配置/脚本文件（.cjs 及裸 .js 配置）合法使用 require/module/__dirname/process 等 Node 全局，
  // 补齐 globals.node 并关闭 no-require-imports，避免对这些既有 CommonJS 文件的误报
  {
    files: ["**/*.cjs", "postcss.config.js", "tailwind.config.js"],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
