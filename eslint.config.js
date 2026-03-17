import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

export default [
  { ignores: ['dist/**', 'node_modules/**', '.git/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], sourceType: 'module', ecmaVersion: 'latest' },
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'vue/no-mutating-props': 'off',
      'no-empty': 'off',
      'no-irregular-whitespace': 'off',
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
      'no-console': 'off',
    },
  },
  { files: ['tests/**/*.ts'], languageOptions: { globals: { ...globals.node } } },
];
