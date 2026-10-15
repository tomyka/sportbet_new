import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: [
      '../../packages/domain/src/network-guard-setup.ts',
      'src/test-setup.ts',
    ],
  },
});
