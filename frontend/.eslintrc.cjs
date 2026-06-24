// ESLint config – catches React Hooks violations (incl. React #310)
// Run: npm run lint
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react', 'react-hooks'],
  rules: {
    // React Hooks – THE critical one. Catches:
    // - hooks called conditionally
    // - hooks called after early return  ← this caught the React #310 crash
    // - hooks in loops / nested functions
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // React 17+ – no need to import React in scope for JSX
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off', // not using PropTypes

    // General hygiene
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  settings: {
    react: { version: 'detect' },
  },
  ignorePatterns: ['dist/', 'node_modules/'],
}
