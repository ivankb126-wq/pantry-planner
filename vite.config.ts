import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { type Plugin, defineConfig } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Publishes src/service-worker.js as sw.js with this build's file list, so
 * the app opens without internet. Price data is cached separately at run time.
 */
function serviceWorker(): Plugin {
  return {
    name: 'pantry-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map'));
      const icons = existsSync('public/icons') ? readdirSync('public/icons').map((f) => `icons/${f}`) : [];
      const precache = ['./', ...built, 'icon.svg', 'manifest.webmanifest', ...icons];
      const template = readFileSync('src/service-worker.js', 'utf8');
      const version = createHash('sha256').update(precache.join('\n')).update(template).digest('hex').slice(0, 12);
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache).replace(/'/g, "\\'"));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow sets
// BASE_PATH; locally the app runs from the root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [preact(), serviceWorker()],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
