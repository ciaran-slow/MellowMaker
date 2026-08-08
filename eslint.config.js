const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const domainRestrictions = [
  {
    group: [
      'react',
      'react-native',
      'expo',
      '@expo/*',
      'expo-*',
      '@/app/*',
      '@/features/*',
      '@/data/*',
      '@/platform/*',
      '@/ui/*',
    ],
  },
  {
    regex:
      '^\\.\\.(?:/\\.\\.)*/(?:app|features|data|platform|ui)(?:/|$)',
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo/**', 'coverage/**', 'dist/**'],
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: domainRestrictions }],
    },
  },
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/features/*', '@/ui/*'],
            },
            {
              regex:
                '^\\.\\.(?:/\\.\\.)*/(?:app|features|ui)(?:/|$)',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/data/**/sqlite/*',
                '@/data/**/remote/*',
                '@/platform/**/sqlite/*',
                '@/platform/**/remote/*',
              ],
            },
            {
              regex:
                '^\\.\\.(?:/\\.\\.)*/(?:data|platform)/.*(?:sqlite|remote)(?:/|$)',
            },
          ],
        },
      ],
    },
  },
]);
