import { defineConfig } from 'astro/config';

export default defineConfig({
  base: process.env.RECAP_BASE_PATH || undefined,
  outDir: process.env.RECAP_OUT_DIR || './dist',
});
