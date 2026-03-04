import { readFileSync } from 'fs';
import { join } from 'path';

describe('manifest.json', () => {
  let manifest: chrome.runtime.ManifestV3;

  beforeAll(() => {
    const manifestPath = join(__dirname, '../../manifest.json');
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(manifestContent);
  });

  it('should have manifest version 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('should have required metadata fields', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.version).toBeTruthy();
    expect(manifest.description).toBeTruthy();
  });

  it('should have background service worker for domain management', () => {
    // Service worker manages dynamic content script registration and allowlist
    expect(manifest.background).toBeDefined();
    expect(manifest.background?.service_worker).toBe('background/service-worker.js');
  });

  it('should register content script for Jira Plans', () => {
    expect(manifest.content_scripts).toBeDefined();
    expect(Array.isArray(manifest.content_scripts)).toBe(true);
    expect(manifest.content_scripts!.length).toBeGreaterThan(0);

    const contentScript = manifest.content_scripts![0];
    expect(contentScript.matches).toBeDefined();
    expect(contentScript.matches).toBeTruthy();
    if (contentScript.matches) {
      expect(contentScript.matches.some((pattern: string) =>
        pattern.includes('atlassian.net') && pattern.includes('plans')
      )).toBe(true);
    }
    expect(contentScript.js).toBeDefined();
    expect(contentScript.js).toBeTruthy();
    if (contentScript.js) {
      expect(contentScript.js.length).toBeGreaterThan(0);
    }
  });

  it('should have required permissions for universal domain support', () => {
    // Storage: settings, cache, and allowlist
    // Tabs: popup-content script communication
    // ActiveTab: inject content script on user click
    // Scripting: dynamic content script registration
    expect(manifest.permissions).toBeDefined();
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['storage', 'tabs', 'activeTab', 'scripting'])
    );
    expect(manifest.permissions?.length).toBe(4);
  });

  it('should have host_permissions for Jira instances', () => {
    expect(manifest.host_permissions).toBeDefined();
    expect(manifest.host_permissions!.some((permission: string) =>
      permission.includes('atlassian.net') || permission.includes('jira')
    )).toBe(true);
  });

  it('should have icon assets defined', () => {
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons!['16']).toBeTruthy();
    expect(manifest.icons!['48']).toBeTruthy();
    expect(manifest.icons!['128']).toBeTruthy();
  });

  it('should have proper file paths', () => {
    const contentScript = manifest.content_scripts![0];
    if (contentScript.js) {
      expect(contentScript.js[0]).toMatch(/^(src\/)?content\//);
    }
  });

  it('should run content script at document_end', () => {
    const contentScript = manifest.content_scripts![0];
    expect(contentScript.run_at).toBe('document_end');
  });
});
