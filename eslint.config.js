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
              group: [
                'react',
                'react-native',
                'expo',
                '@expo/*',
                'expo-*',
                '@/app/*',
                '@/features/*',
                '@/ui/*',
              ],
              message:
                'Data access owns SQL and mapping only. Expo, React Native, and presentation belong to the platform and UI layers.',
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
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts'],
        },
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          basePath: process.cwd(),
          zones: [
            {
              target: ['./src/features', './src/ui'],
              from: './src/platform',
              message:
                'Feature and UI code must depend on platform contracts, not concrete platform adapters.',
            },
            {
              target: ['./src/features', './src/ui'],
              from: './src/data',
              except: ['./contracts'],
              message:
                'Feature and UI code may import data contracts, not concrete data adapters.',
            },
          ],
        },
      ],
    },
  },
]);
