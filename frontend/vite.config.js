import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.jsx', // entry point: mounts the app, no logic of its own
        'src/App.jsx', // dead code: imports ./pages/* which no longer exist (main.jsx uses Router.jsx)
        'src/setupTests.ts',
        'src/**/__tests__/**',
        'src/**/*.test.{js,jsx}',
        'src/__mocks__/**',
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
  server: {
    port: 5173,
  },
})
