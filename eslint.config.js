import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import tsParser from '@typescript-eslint/parser';
import { dentalI18nPlugin } from './scripts/eslint-i18n-plugin.mjs';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*'],
  },
  {
    files: ['firestore.rules'],
    ...firebaseRulesPlugin.configs['flat/recommended'],
  },
  {
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'dental-i18n': dentalI18nPlugin,
    },
    rules: {
      'dental-i18n/no-hardcoded-persian-jsx': 'error',
    },
  },
];
