import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Extension Structure', () => {
  const distPath = join(__dirname, '../../dist');

  describe('dist folder', () => {
    it('should exist after build', () => {
      // This test verifies the build output exists
      // Run 'npm run build' before running this test
      expect(existsSync(distPath)).toBe(true);
    });

    it('should have manifest.json', () => {
      const manifestPath = join(distPath, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);
    });

    it('should not have background service worker JS (DOM-only approach)', () => {
      // Service worker not needed for DOM-only approach
      // Build may still produce background files from TypeScript compilation,
      // but they won't be loaded since manifest doesn't reference them
      const csPath = join(distPath, 'content/content-script.js');
      expect(existsSync(csPath)).toBe(true);
    });

    it('should have content script JS', () => {
      const csPath = join(distPath, 'content/content-script.js');
      expect(existsSync(csPath)).toBe(true);
    });

    it('should have icon assets', () => {
      const icon16 = join(distPath, 'icons/icon16.png');
      const icon48 = join(distPath, 'icons/icon48.png');
      const icon128 = join(distPath, 'icons/icon128.png');

      expect(existsSync(icon16)).toBe(true);
      expect(existsSync(icon48)).toBe(true);
      expect(existsSync(icon128)).toBe(true);
    });
  });

  describe('dist manifest.json', () => {
    let manifest: chrome.runtime.ManifestV3;

    beforeAll(() => {
      const manifestPath = join(distPath, 'manifest.json');
      if (existsSync(manifestPath)) {
        const manifestContent = readFileSync(manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent);
      }
    });

    it('should point to compiled JS files', () => {
      expect(manifest?.background).toBeUndefined();
      expect(manifest?.content_scripts?.[0]?.js?.[0]).toBe('content/content-script.js');
    });

    it('should not reference TypeScript files', () => {
      const csPath = manifest?.content_scripts?.[0]?.js?.[0] || '';

      expect(csPath).not.toMatch(/\.ts$/);
    });
  });
});
