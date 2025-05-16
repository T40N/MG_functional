module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    // Tab of 2 spaces
    'indent': ['error', 2],
    // Single quotes for strings
    'quotes': ['error', 'single'],
    // Single quotes for imports
    'jsx-quotes': ['error', 'prefer-single'],
    // Other sensible defaults
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'always-multiline'],
    'no-console': 'off', // Allow console statements without warnings
  },
};
