module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  ignorePatterns: ['dist', '.eslintrc.js', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['react-refresh', '@typescript-eslint', 'react', 'react-hooks', 'security'],
  rules: {
    // React specific rules
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // TypeScript specific rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'warn',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',

    // Security rules
    'security/detect-object-injection': 'warn',
    'security/detect-non-literal-regexp': 'off', // Too restrictive for this project
    'security/detect-unsafe-regex': 'off', // Too restrictive for this project
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'warn',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-new-buffer': 'off', // Node.js Buffer is used
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-require': 'off', // Dynamic imports are used
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-pseudoRandomBytes': 'error',

    // General rules
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'arrow-spacing': 'error',
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
    'comma-dangle': ['error', 'always-multiline'],
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'jsx-quotes': ['error', 'prefer-double'],
    'indent': ['error', 2, { SwitchCase: 1 }],
    'max-len': ['warn', { code: 100, ignoreUrls: true }],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'brace-style': ['error', '1tbs'],
    'keyword-spacing': 'error',
    'space-before-blocks': 'error',
    'space-infix-ops': 'error',
    'space-unary-ops': 'error',
    'spaced-comment': ['error', 'always'],
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'no-undef': 'off', // TypeScript handles this
      },
    },
    {
      files: ['server/**/*.ts'],
      env: {
        node: true,
        browser: false,
      },
      rules: {
        'no-console': 'off', // Server code can use console
      },
    },
    {
      files: ['tests/**/*.ts'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'security/detect-object-injection': 'off',
      },
    },
    {
      files: ['vite.config.ts', 'vitest.config.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};