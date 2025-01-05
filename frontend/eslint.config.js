// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import { FlatCompat } from "@eslint/eslintrc";
import { includeIgnoreFile } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const gitignorePath = path.resolve(__dirname, "../", ".gitignore");

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.stylisticTypeChecked,
  tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  compat.extends("next/core-web-vitals", "next/typescript"),
  includeIgnoreFile(gitignorePath),
);
