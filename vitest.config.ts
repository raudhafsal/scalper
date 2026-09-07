import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // The real `server-only` package throws unconditionally unless
      // resolved via Next.js's "react-server" export condition. Under
      // plain Vitest there is no bundler applying that condition, so we
      // alias it to a no-op here; Next's own build still enforces the
      // real guard for the actual app.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
