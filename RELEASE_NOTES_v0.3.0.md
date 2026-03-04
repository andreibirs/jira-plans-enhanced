# v0.3.0 - Universal Domain Support

## 🎉 Universal Domain Support with Allowlist

This release makes Jira Plans Enhanced work on **any Jira instance** - Cloud, Server, or Data Center - through a user-controlled domain allowlist.

### ✨ What's New

#### Custom Domain Allowlist
- **Add any Jira domain** to auto-injection allowlist (corporate, self-hosted, etc.)
- **One-time setup** per domain, then auto-works forever
- **Manage domains** directly from popup UI
- **Visual badge** shows domain status (+ = click to add)

#### Better User Experience
- 🟢 **No badge** = Domain already supported (working automatically)
- ⚪ **"+" badge** = Domain not yet added (click icon to add)
- ⚡ **Instant activation** = No refresh needed after adding domain
- 📊 **Clear status messages** = Better feedback on what's happening

#### Background Service Worker
- Manages dynamic content script registration
- Monitors tab changes to update badge state
- Persists allowlist across browser sessions

### 🔧 How It Works

**Built-in Domains** (*.atlassian.net, *.jira.com):
- Works automatically, no setup needed

**Custom Domains** (e.g., jira.corp.company.com):
1. Navigate to your Jira page
2. See "+" badge on extension icon
3. Click icon → "Add to allowlist" button
4. Done! Auto-works from now on

### 🏪 Chrome Web Store Ready

This release is optimized for Chrome Web Store approval:
- ✅ Universal compatibility without hardcoded domains
- ✅ Standard permission patterns (activeTab, scripting)
- ✅ User-controlled, privacy-friendly allowlist
- ✅ Clear permission justification

**New Permissions:**
- `activeTab` - Inject content script when user clicks icon
- `scripting` - Register content scripts for allowlisted domains
- `background` - Manage persistent allowlist and badge state

### 📦 Installation

1. Download `jira-plans-enhanced.zip`
2. Extract to a folder
3. Open `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the extracted folder

### 🐛 Bug Fixes

- Fixed error messages when opening popup on non-Jira pages
- Fixed content script path in manifest (dist folder structure)
- Better error handling for content script communication

### 📚 Documentation

- Added `DEBUG.md` - Troubleshooting guide for service worker issues
- Updated `COMPATIBILITY.md` - Domain compatibility documentation

### 🔄 Upgrade from v0.2.0

Fully backward compatible. Existing settings preserved.

---

**Full Changelog**: https://github.com/andreibirs/jira-plans-enhanced/compare/v0.2.0...v0.3.0
