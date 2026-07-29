import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Being in .gitignore is not enough — ESLint keeps its own list. `.research/`
  // holds pages agents downloaded to read, and `ui/` is generated.
  { ignores: ['coverage/', 'dist/', 'node_modules/', '.research/', 'ui/', '.playwright-mcp/'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
);
