import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow sets
// BASE_PATH; locally the app runs from the root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [preact()],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
