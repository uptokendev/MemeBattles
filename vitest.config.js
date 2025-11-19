import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,      // enable describe/it/expect globally
    environment: 'node' // run in Node environment
  }
});