const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const domainRestrictions = [
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
        { patterns: ['@/app/*', '@/features/*', '@/ui/*'] },
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
            '@/data/**/sqlite/*',
            '@/data/**/remote/*',
            '@/platform/**/sqlite/*',
            '@/platform/**/remote/*',
          ],
        },
      ],
    },
  },
]);
