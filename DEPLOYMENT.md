# Deployment Guide

This document explains how to release new versions of Jira Plans Enhanced and configure automatic publishing to the Chrome Web Store.

## Table of Contents

- [Quick Release Process](#quick-release-process)
- [Chrome Web Store Setup](#chrome-web-store-setup)
- [GitHub Secrets Configuration](#github-secrets-configuration)
- [Manual Release Process](#manual-release-process)
- [Troubleshooting](#troubleshooting)

## Quick Release Process

Once Chrome Web Store publishing is configured (see below), releasing is simple:

1. **Update version** in `package.json` and `manifest.dist.json`:
   ```bash
   # Both files must have matching versions
   npm version patch   # For bug fixes (0.4.0 -> 0.4.1)
   npm version minor   # For new features (0.4.0 -> 0.5.0)
   npm version major   # For breaking changes (0.4.0 -> 1.0.0)
   ```

2. **Create and push tag**:
   ```bash
   git push origin main
   git push origin --tags
   ```

3. **GitHub Actions automatically**:
   - ✅ Runs linting
   - ✅ Runs tests
   - ✅ Builds the extension
   - ✅ Creates GitHub release with .zip file
   - ✅ Publishes to Chrome Web Store

4. **Monitor the release**:
   - GitHub Actions: https://github.com/andreibirs/jira-plans-enhanced/actions
   - Chrome Web Store Developer Dashboard: https://chrome.google.com/webstore/devconsole

## Chrome Web Store Setup

To enable automatic publishing, you need to obtain API credentials from the Chrome Web Store.

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Chrome Web Store API**:
   - Navigate to **APIs & Services** > **Library**
   - Search for "Chrome Web Store API"
   - Click **Enable**

### Step 2: Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - User Type: **External**
   - App name: "Jira Plans Enhanced CI/CD"
   - User support email: Your email
   - Developer contact: Your email
   - Save and continue through all steps
4. Create OAuth client ID:
   - Application type: **Web application**
   - Name: "Chrome Web Store Publisher"
   - Authorized redirect URIs: `http://localhost:8818/`
   - Click **Create**
5. **Save the credentials**:
   - Client ID (e.g., `123456789.apps.googleusercontent.com`)
   - Client Secret (e.g., `GOCSPX-abc123def456`)

### Step 3: Generate Refresh Token

You need to generate a refresh token that allows GitHub Actions to publish on your behalf.

1. **Install chrome-webstore-upload-cli** locally:
   ```bash
   npm install -g chrome-webstore-upload-cli
   ```

2. **Run the token generator**:
   ```bash
   chrome-webstore-upload-cli get-refresh-token
   ```

3. **Follow the prompts**:
   - Enter your Client ID
   - Enter your Client Secret
   - A browser window will open asking you to authorize the app
   - Sign in with the Google account that owns the Chrome Web Store extension
   - Grant permissions
   - You'll be redirected to `http://localhost:8818/` with a code

4. **Copy the Refresh Token** from the CLI output (e.g., `1//0abc123def456...`)

### Step 4: Get Extension ID

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Find your extension
3. Copy the **Extension ID** from the URL or extension details
   - Example: `abcdefghijklmnopqrstuvwxyz123456`

## GitHub Secrets Configuration

Add the following secrets to your GitHub repository:

1. Go to your repository: https://github.com/andreibirs/jira-plans-enhanced
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret** and add each of these:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `CHROME_EXTENSION_ID` | Your extension's ID from Chrome Web Store | `abcdefghijklmnopqrstuvwxyz123456` |
| `CHROME_CLIENT_ID` | OAuth Client ID from Google Cloud Console | `123456789.apps.googleusercontent.com` |
| `CHROME_CLIENT_SECRET` | OAuth Client Secret from Google Cloud Console | `GOCSPX-abc123def456` |
| `CHROME_REFRESH_TOKEN` | Refresh token generated with chrome-webstore-upload-cli | `1//0abc123def456...` |

### Verifying Secrets

After adding secrets, trigger a release to verify everything works:

```bash
# Create a test release
git tag v0.4.1-test
git push origin v0.4.1-test
```

Check GitHub Actions to see if publishing succeeds. If it fails, check the [Troubleshooting](#troubleshooting) section.

## Manual Release Process

If you need to publish manually (e.g., GitHub Actions is down), follow these steps:

### Build the Extension

```bash
# Clean build
npm run clean

# Run full build (includes linting and tests)
npm run build

# Create release zip
npm run package
```

This creates `jira-plans-enhanced.zip` in the project root.

### Upload to Chrome Web Store

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Select your extension
3. Click **Package** > **Upload new package**
4. Drag and drop `jira-plans-enhanced.zip`
5. Review the changes
6. Click **Submit for review**

### Create GitHub Release

1. Go to https://github.com/andreibirs/jira-plans-enhanced/releases
2. Click **Draft a new release**
3. Create a new tag (e.g., `v0.4.1`)
4. Add release notes
5. Upload the `jira-plans-enhanced.zip` file
6. Click **Publish release**

## Troubleshooting

### Extension fails to publish with "invalid_grant"

**Problem**: Refresh token has expired or was revoked.

**Solution**: Regenerate the refresh token:
```bash
chrome-webstore-upload-cli get-refresh-token
```
Update the `CHROME_REFRESH_TOKEN` secret in GitHub.

### Extension fails with "forbidden"

**Problem**: The OAuth client doesn't have permission to publish this extension.

**Solution**: Ensure the Google account used to generate the refresh token is the owner of the extension in the Chrome Web Store Developer Dashboard.

### Build fails with lint errors

**Problem**: Code doesn't pass linting checks.

**Solution**: Fix linting errors locally before tagging:
```bash
npm run lint
npm run lint:fix  # Auto-fix some issues
```

### Build fails with test failures

**Problem**: Tests are failing.

**Solution**: Run tests locally and fix issues:
```bash
npm test
npm run test:watch  # Interactive test runner
```

### Version mismatch error

**Problem**: `package.json` version doesn't match `manifest.dist.json` version or git tag.

**Solution**: Ensure all versions match:
```bash
# Check versions
grep version package.json
grep version manifest.dist.json
git describe --tags

# Update if needed
npm version 0.4.1  # This updates package.json
# Manually update manifest.dist.json to match
```

### Extension upload succeeds but doesn't publish

**Problem**: Extension is uploaded but not automatically submitted for review.

**Solution**: This is expected behavior. The `publish: true` flag in the GitHub Action submits for review, but Google may hold it in review queue. Check the Chrome Web Store Developer Dashboard for the review status.

### Can't access Chrome Web Store API

**Problem**: API returns 403 or "Chrome Web Store API has not been used in project..."

**Solution**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **Library**
4. Search for "Chrome Web Store API"
5. Ensure it's **Enabled**
6. If recently enabled, wait 5-10 minutes for propagation

## Release Checklist

Before creating a release, verify:

- [ ] All tests pass locally (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Build succeeds (`npm run build`)
- [ ] Extension works in browser (load `dist/` folder)
- [ ] Version numbers match in `package.json` and `manifest.dist.json`
- [ ] CHANGELOG.md updated with changes
- [ ] README.md updated if needed (new features, installation instructions)
- [ ] Chrome Web Store secrets configured in GitHub

## Resources

- [Chrome Web Store API Documentation](https://developer.chrome.com/docs/webstore/using_webstore_api/)
- [chrome-webstore-upload-cli](https://github.com/fregante/chrome-webstore-upload-cli)
- [GitHub Actions - Chrome Extension Upload](https://github.com/mnao305/chrome-extension-upload)
- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Google Cloud Console](https://console.cloud.google.com/)

## Support

If you encounter issues not covered in this guide:

1. Check [GitHub Actions logs](https://github.com/andreibirs/jira-plans-enhanced/actions) for error details
2. Search [existing issues](https://github.com/andreibirs/jira-plans-enhanced/issues)
3. Open a new issue with:
   - Error message from GitHub Actions
   - Steps you've already tried
   - Relevant screenshots
