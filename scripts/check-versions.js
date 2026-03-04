#!/usr/bin/env node
/**
 * Version Consistency Checker
 *
 * Validates that package.json, manifest.json, and manifest.dist.json
 * all have the same version number.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// Read version from each file
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const manifestJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const manifestDistJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.dist.json'), 'utf8'));

const packageVersion = packageJson.version;
const manifestVersion = manifestJson.version;
const manifestDistVersion = manifestDistJson.version;

console.log('Version Consistency Check');
console.log('=========================');
console.log(`package.json:       ${packageVersion}`);
console.log(`manifest.json:      ${manifestVersion}`);
console.log(`manifest.dist.json: ${manifestDistVersion}`);
console.log('');

// Check if all versions match
if (packageVersion === manifestVersion && manifestVersion === manifestDistVersion) {
  console.log('✅ All versions match!');
  process.exit(0);
} else {
  console.error('❌ Version mismatch detected!');
  console.error('');
  console.error('All three files must have the same version number.');
  console.error('Please update the mismatched file(s) and try again.');
  process.exit(1);
}
