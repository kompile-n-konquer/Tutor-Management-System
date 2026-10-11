import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // All API calls must go through the shared client so the Firebase ID
      // token is attached and the 401 retry can fire — no direct axios use.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message:
                'Import the shared API client from src/utils/axiosInstance.js instead, so the Firebase ID token is attached.',
            },
          ],
        },
      ],
    },
  },
  {
    // The shared client itself, and its test (which asserts on axios.create).
    files: ['src/utils/axiosInstance.js', 'src/utils/axiosInstance.test.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
