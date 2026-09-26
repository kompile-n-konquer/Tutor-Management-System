import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_BACKEND_BASE_URL': JSON.stringify(env.BACKEND_BASE_URL),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.FIREBASE_API_KEY),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.FIREBASE_AUTH_DOMAIN),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.FIREBASE_PROJECT_ID),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.FIREBASE_STORAGE_BUCKET),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.FIREBASE_MESSAGING_SENDER_ID),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.FIREBASE_APP_ID),
      'import.meta.env.VITE_FIREBASE_MEASUREMENT_ID': JSON.stringify(env.FIREBASE_MEASUREMENT_ID),
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        // Only report files the test run actually imports. With `all: true`
        // coverage-v8 parses never-imported .jsx files as plain JavaScript and
        // dies on the first JSX expression (src/App.jsx pos 661), and most of
        // the app has no tests yet after the suite cleanup.
        all: false,
        include: ['src/**/*.{js,jsx}'],
        exclude: [
          'src/**/*.d.ts',
          'src/main.jsx',
          'src/setupTests.ts',
          'src/**/__tests__/**',
          'src/**/*.test.{js,jsx}',
        ],
      },
    },
    server: {
      port: 5173,
    },
  }
})