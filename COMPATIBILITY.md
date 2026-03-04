# Domain Compatibility

Jira Plans Enhanced works on **any Jira instance** - Cloud, Server, or Data Center - without requiring manual configuration.

## Supported Jira Instances

### ✅ Auto-Injection (Instant)

The extension automatically works on these common Jira Cloud domains:
- `*.atlassian.net` (e.g., `yourcompany.atlassian.net`)
- `*.jira.com` (e.g., `yourcompany.jira.com`)

The content script is automatically injected when you navigate to these domains.

### ✅ Manual Injection (Click-to-Activate)

For corporate/self-hosted Jira instances with custom domains:
- `jira.company.com`
- `jira.corp.company.com`
- Any custom domain

**How to use:**
1. Navigate to your Jira Plans page
2. Click the extension icon in your toolbar
3. The extension automatically injects itself and starts working
4. All features work normally after injection

## Technical Details

### Why Two Modes?

Chrome Web Store policies restrict extensions from requesting permissions for specific corporate domains. To make the extension universally compatible, we use:

1. **Declarative content scripts** - Auto-inject on common Jira Cloud domains
2. **Programmatic injection** - On-demand injection for custom domains using `activeTab` permission

This hybrid approach provides:
- ✅ Instant activation on Jira Cloud
- ✅ Universal compatibility with any Jira instance
- ✅ Chrome Web Store compliance
- ✅ No manual configuration required

### Permissions Explained

The extension requires these permissions:

- **`storage`** - Save your settings (cache TTL, badge preferences)
- **`tabs`** - Communicate between popup and content script
- **`activeTab`** - Inject content script when you click the icon (custom domains)
- **`scripting`** - Programmatically inject content script code
- **`host_permissions`** - Access Jira pages (`*.atlassian.net`, `*.jira.com`)

All permissions are used exclusively for the extension's core functionality. No data is collected or transmitted outside your browser.

## URL Pattern Support

The extension activates on these Jira URL patterns:

**Jira Plans (Advanced Roadmaps):**
- `/jira/software/c/*/plans*`
- `/secure/PortfolioPlanView.jspa*`

**Other Jira Pages:**
- `/secure/*` (issue views, boards, backlogs)

## Troubleshooting

### Extension icon is grayed out

**Cause:** You're on a page that doesn't match Jira URL patterns.

**Solution:** Navigate to a Jira Plans page or any `/secure/*` page.

### "Not connected to Jira Plans" message

**Cause:** Content script not loaded yet (custom domain).

**Solution:**
1. Refresh the Jira page
2. Click the extension icon again
3. Wait for content script to inject (~100ms)

### Badges not appearing

**Possible causes:**
1. Jira Plans DOM structure changed (Atlassian updates)
2. You're on a different view (not Plans backlog/timeline)
3. Content script failed to load

**Solutions:**
1. Check browser console for errors (F12)
2. Reload the extension: `chrome://extensions/` → click reload icon
3. Open an issue on GitHub with browser console logs

## Browser Support

- ✅ Chrome 88+ (Manifest V3)
- ✅ Edge 88+ (Chromium-based)
- ✅ Brave (Chromium-based)
- ❌ Firefox (requires Manifest V2 port)
- ❌ Safari (requires separate Safari extension port)

## Privacy & Security

All processing happens **locally in your browser**:
- No data sent to external servers
- No analytics or tracking
- Settings stored in Chrome's local storage
- Source code is open and auditable on GitHub

The extension only accesses Jira APIs that your browser already has access to (using your existing authentication).
