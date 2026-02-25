import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separate config for testing 
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
  },
})
