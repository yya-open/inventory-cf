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
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-self-closing': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'no-console': 'off',
    },
  },
  {
    // 消息门面护栏：EP 的 message / message-box / notification 只允许从
    // utils/el-services.ts 这唯一入口 re-export，禁止其它文件从 element-plus
    // 深路径直接 import（当初 el-message.ts 分裂即源于此）。el-services 自身豁免。
    files: ['src/**/*.{ts,tsx,vue}'],
    ignores: ['**/utils/el-services.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'element-plus', importNames: ['ElMessage', 'ElMessageBox', 'ElNotification'], message: '请从 utils/el-services 导入反馈服务' },
          { name: 'element-plus/es/components/message/index', message: '请从 utils/el-services 导入 ElMessage' },
          { name: 'element-plus/es/components/message-box/index', message: '请从 utils/el-services 导入 ElMessageBox' },
          { name: 'element-plus/es/components/notification/index', message: '请从 utils/el-services 导入 ElNotification' },
        ],
      }],
    },
  },
  {
    // 业务代码只能通过反馈门面访问消息服务，基础反馈编排模块保留直接依赖。
    files: ['src/**/*.{ts,tsx,vue}'],
    ignores: [
      '**/utils/el-services.ts',
      '**/utils/feedback.ts',
      '**/utils/operationFeedback.ts',
      '**/utils/riskAction.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'element-plus', importNames: ['ElMessage', 'ElMessageBox', 'ElNotification'], message: '请从 utils/feedback 使用消息门面' },
          { name: 'element-plus/es/components/message/index', message: '请从 utils/feedback 使用消息门面' },
          { name: 'element-plus/es/components/message-box/index', message: '请从 utils/feedback 使用消息门面' },
          { name: 'element-plus/es/components/notification/index', message: '请从 utils/feedback 使用消息门面' },
          { name: 'src/utils/el-services', message: '请从 utils/feedback 使用消息门面' },
          { name: '../utils/el-services', message: '请从 utils/feedback 使用消息门面' },
          { name: '../../utils/el-services', message: '请从 utils/feedback 使用消息门面' },
        ],
        patterns: [
          { group: ['**/utils/el-services'], message: '请从 utils/feedback 使用消息门面' },
        ],
      }],
    },
  },
  { files: ['tests/**/*.ts'], languageOptions: { globals: { ...globals.node } } },
];
