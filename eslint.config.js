import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Being in .gitignore is not enough — ESLint keeps its own list. `.research/`
  // holds pages agents downloaded to read, and `ui/` is generated.
  {
    // .claude/worktrees holds other agents' checkouts of this same repository.
    // Linting them reports another branch's problems as this branch's, and the
    // files are not ours to fix.
    ignores: [
      'coverage/',
      'dist/',
      'node_modules/',
      '.research/',
      'ui/',
      '.playwright-mcp/',
      '.claude/worktrees/',
    ],
  },
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
