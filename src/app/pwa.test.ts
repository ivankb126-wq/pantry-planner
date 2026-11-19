import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('home screen app', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it('has a manifest that opens full screen', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url.startsWith('./')).toBe(true);
  });

  it('has every icon it lists, including 192, 512 and maskable', () => {
    for (const icon of manifest.icons) expect(existsSync(`public/${icon.src}`)).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    expect(existsSync('public/icons/apple-touch-icon.png')).toBe(true);
  });

  it('links the manifest and iPhone icon from the page', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
  });

  it('has a service worker template the build can fill in', () => {
    const sw = readFileSync('src/service-worker.js', 'utf8');
    expect(sw).toContain("'__VERSION__'");
    expect(sw).toContain("'__PRECACHE__'");
  });
});
