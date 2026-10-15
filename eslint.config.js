// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

// Import boundaries in src/app; README.md, "Folders and imports", explains them.
// The rules match `@app/` paths, so imports that leave the parent folder must use the alias.
const noDeepRelative = {
  regex: '^\\.\\./\\.\\./',
  message: 'Import from outside the parent folder with the @app/ alias.',
};
// Files at a feature's top level are entry points for the router, except its link builders (*.paths.ts).
const noFeatureEntryPoints = {
  regex: '^@app/features/[^/]+/(pages/|(?![^/]+\\.paths$)[^/]+$)',
  message:
    "Only the router loads pages and route files. Share a feature's code from its *.paths.ts file or its other folders (data-access/, transfer/, versions/).",
};
const importBoundaries = (...patterns) => ['error', { patterns: [noDeepRelative, ...patterns] }];

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: ['app', 'ink'],
          style: 'camelCase',
        },
      ],
      // The root component is <app-root>; every other component is <ink-…>.
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: ['app', 'ink'],
          style: 'kebab-case',
        },
      ],
      // `_view`, `_old`: unused parameters kept for their position.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/app/**/*.ts'],
    rules: { 'no-restricted-imports': importBoundaries(noFeatureEntryPoints) },
  },
  {
    files: ['src/app/app.routes.ts'],
    rules: { 'no-restricted-imports': importBoundaries() },
  },
  {
    files: ['src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': importBoundaries({
        regex: '^@app/(?!shared/)',
        message: 'shared/ must not depend on core/, layout/ or features/.',
      }),
    },
  },
  {
    files: ['src/app/core/**/*.ts'],
    rules: {
      'no-restricted-imports': importBoundaries({
        regex: '^@app/(?!core/|shared/)',
        message: 'core/ must not depend on layout/ or features/.',
      }),
    },
  },
  {
    // A feature's logic (data-access/, transfer/, versions/), as opposed to its pages.
    files: ['src/app/features/*/*/**/*.ts'],
    ignores: ['src/app/features/*/pages/**'],
    rules: {
      'no-restricted-imports': importBoundaries(noFeatureEntryPoints, {
        regex: '^(@app/layout/|\\.\\./pages/)',
        message: 'Feature logic must not depend on the app shell or on pages.',
      }),
    },
  },
  {
    // Tests reach into internals (`(svc as any).view`) and stub with no-op functions.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
