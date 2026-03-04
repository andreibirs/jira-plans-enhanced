# Debugging Guide

## Check Service Worker Console

The background service worker handles icon updates. To debug why icons aren't changing:

1. Go to `chrome://extensions/`
2. Find "Jira Plans Enhanced"
3. Click **"Inspect views: service worker"** (or just "service worker" link)
4. This opens DevTools for the background service worker
5. Check the **Console** tab for logs

You should see logs like:
```
[Service Worker] Initializing service worker...
[Service Worker] Initialization complete
[Service Worker] Updating icons for 5 existing tabs
[Icon Update] Tab 123, Domain: jira.corp.adobe.com, Supported: false
[Icon Update] Set gray icon for jira.corp.adobe.com
```

If you don't see any logs:
- The service worker might not be running
- Reload the extension and check again

When you switch tabs or load a page, you should see:
```
[Tab Updated] TabId: 456, Status: complete, URL: https://jira.corp.adobe.com/...
[Icon Update] Tab 456, Domain: jira.corp.adobe.com, Supported: false
[Icon Update] Set gray icon for jira.corp.adobe.com
```

## Check Icon Files

Verify gray icons exist:
```bash
ls -la dist/icons/icon*-gray.png
```

You should see:
- `icon16-gray.png`
- `icon48-gray.png`
- `icon128-gray.png`

## Force Service Worker Reload

If the service worker isn't updating:

1. Go to `chrome://extensions/`
2. Click **reload icon** for "Jira Plans Enhanced"
3. Check service worker console again

## Test Icon Update Manually

In the service worker console, run:
```javascript
chrome.tabs.query({active: true, currentWindow: true}).then(tabs => {
  const tab = tabs[0];
  console.log('Current tab:', tab.id, tab.url);

  chrome.action.setIcon({
    tabId: tab.id,
    path: {
      '16': 'icons/icon16-gray.png',
      '48': 'icons/icon48-gray.png',
      '128': 'icons/icon128-gray.png',
    }
  }).then(() => console.log('Gray icon set'));
});
```

If this works, the icon files are good and the issue is with the event listeners.

If this fails with an error, the icon file paths might be wrong.

## Common Issues

### Service Worker Not Running
- Reload the extension
- Check for errors in service worker console

### Icons Not Changing
- Chrome may cache icons - try reloading extension
- Check icon file paths are correct
- Verify event listeners are firing (check console logs)

### Icon Changes but Wrong Color
- Check if domain detection is working correctly
- Verify `isDomainSupported()` logic in console:
  ```javascript
  // In service worker console:
  chrome.storage.sync.get('jira-plans-allowlisted-domains').then(result => {
    console.log('Allowlisted domains:', result);
  });
  ```
