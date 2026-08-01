import { defineConfig } from 'vite';

// GitHub Pages serves the app from /whisker-walk/, so production builds need
// that base path; dev stays at / so localhost play is unaffected.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/whisker-walk/' : '/',
}));
