#!/usr/bin/env node
/**
 * Version Synchronization Script
 *
 * Reads version from package.json and updates manifest.json and manifest.dist.json
 * to match. Run this script after using `npm version` to bump the version.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// Read version from package.json (source of truth)
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const targetVersion = packageJson.version;

console.log(`Syncing all manifests to version: ${targetVersion}`);
console.log('');

// Update manifest.json
const manifestJsonPath = path.join(rootDir, 'manifest.json');
const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));
const oldManifestVersion = manifestJson.version;
manifestJson.version = targetVersion;
fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2) + '\n');
console.log(`✅ Updated manifest.json: ${oldManifestVersion} → ${targetVersion}`);

// Update manifest.dist.json
const manifestDistJsonPath = path.join(rootDir, 'manifest.dist.json');
const manifestDistJson = JSON.parse(fs.readFileSync(manifestDistJsonPath, 'utf8'));
const oldManifestDistVersion = manifestDistJson.version;
manifestDistJson.version = targetVersion;
fs.writeFileSync(manifestDistJsonPath, JSON.stringify(manifestDistJson, null, 2) + '\n');
console.log(`✅ Updated manifest.dist.json: ${oldManifestDistVersion} → ${targetVersion}`);

// Update popup.html version pill
const popupHtmlPath = path.join(rootDir, 'src', 'popup', 'popup.html');
let popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');
const versionPillRegex = /(<span class="version-pill">)[^<]+(<\/span>)/;
popupHtml = popupHtml.replace(versionPillRegex, `$1${targetVersion}$2`);
fs.writeFileSync(popupHtmlPath, popupHtml);
console.log(`✅ Updated popup.html version pill → ${targetVersion}`);

console.log('');
console.log('All versions synchronized!');
