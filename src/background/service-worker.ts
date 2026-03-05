/**
 * Background Service Worker for Jira Plans Enhanced
 *
 * Manages dynamic content script registration for custom domains.
 * When user adds a domain to the allowlist, we register a content script
 * that auto-injects on that domain (just like built-in Jira Cloud domains).
 */

interface AllowlistedDomain {
  domain: string;
  pattern: string;
  addedAt: number;
}

const ALLOWLIST_KEY = 'jira-plans-allowlisted-domains';

/**
 * Load allowlisted domains from storage
 */
async function loadAllowlistedDomains(): Promise<AllowlistedDomain[]> {
  const result = await chrome.storage.sync.get(ALLOWLIST_KEY);
  return result[ALLOWLIST_KEY] || [];
}

/**
 * Save allowlisted domains to storage
 */
async function saveAllowlistedDomains(domains: AllowlistedDomain[]): Promise<void> {
  await chrome.storage.sync.set({ [ALLOWLIST_KEY]: domains });
}

/**
 * Register content script for a domain pattern and inject into existing tabs
 * Returns number of tabs that were successfully injected
 *
 * Note: For custom domains without host permissions, the registration will fail.
 * This is expected - users will need to click the popup on each tab to activate.
 */
async function registerContentScriptForDomain(domain: string, pattern: string): Promise<number> {
  const scriptId = `custom-domain-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;

  try {
    // Unregister if already exists
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
    } catch (e) {
      // Ignore if doesn't exist
    }

    // Register content script for future page loads
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: scriptId,
          matches: [pattern],
          js: ['content/content-script.js'],
          runAt: 'document_end',
        },
      ]);
      console.log(`[Service Worker] Registered content script for ${domain}`);
    } catch (error) {
      console.log(`[Service Worker] Cannot register for ${domain} (may lack permissions)`);
    }

    // Inject into existing tabs
    return await injectIntoExistingTabs(domain, pattern);
  } catch (error) {
    console.error(`[Service Worker] Error registering ${domain}:`, error);
    return 0;
  }
}

/**
 * Inject content script into existing tabs that match the domain pattern
 * Returns number of tabs that were successfully injected
 */
async function injectIntoExistingTabs(domain: string, pattern: string): Promise<number> {
  console.log(`[Inject Existing] Starting injection for domain: ${domain}, pattern: ${pattern}`);

  try {
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    console.log(`[Inject Existing] Found ${tabs.length} total tabs`);

    // Convert match pattern to regex
    // Pattern is like "*://jira.corp.adobe.com/jira/software/c/*/plans*"
    // IMPORTANT: Escape special chars BEFORE replacing * with .*
    const patternRegex = pattern
      .replace(/\./g, '\\.')  // Escape dots FIRST
      .replace(/\//g, '\\/')  // Escape forward slashes
      .replace(/\*/g, '.*');  // Replace * with .* LAST
    const regex = new RegExp(`^${patternRegex}$`);
    console.log(`[Inject Existing] Pattern regex: ${regex}`);

    let injectedCount = 0;
    let matchedCount = 0;

    for (const tab of tabs) {
      if (!tab.id || !tab.url) {
        console.log(`[Inject Existing] Skipping tab ${tab.id} - no URL`);
        continue;
      }

      try {
        // Test if URL matches the pattern
        if (regex.test(tab.url)) {
          matchedCount++;
          console.log(`[Inject Existing] ✓ Tab ${tab.id} matches pattern: ${tab.url}`);

          // Check if content script is already injected by trying to communicate
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
            console.log(`[Inject Existing] Tab ${tab.id} already has content script, skipping`);
            continue;
          } catch (e) {
            // Content script not present, proceed with injection
            console.log(`[Inject Existing] Tab ${tab.id} needs injection`);
          }

          // Try to inject (will succeed for built-in domains, fail for custom domains without permissions)
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content-script.js'],
          });

          injectedCount++;
          console.log(`[Inject Existing] ✓ Successfully injected into tab ${tab.id}`);
        } else {
          console.log(`[Inject Existing] ✗ Tab ${tab.id} does not match: ${tab.url}`);
        }
      } catch (error) {
        // Expected to fail for custom domains without host permissions
        console.log(`[Inject Existing] Cannot inject into tab ${tab.id} (expected for custom domains): ${error}`);
        // Continue with other tabs
      }
    }

    console.log(`[Inject Existing] Complete: ${matchedCount} matched, ${injectedCount} injected`);
    return injectedCount;
  } catch (error) {
    console.error('[Inject Existing] Failed to inject into existing tabs:', error);
    return 0;
  }
}

/**
 * Unregister content script for a domain
 */
async function unregisterContentScriptForDomain(domain: string): Promise<void> {
  const scriptId = `custom-domain-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
    console.log(`Unregistered content script for domain: ${domain}`);
  } catch (error) {
    console.error(`Failed to unregister content script for ${domain}:`, error);
  }
}

/**
 * Initialize all allowlisted domains on extension startup
 */
async function initializeAllowlistedDomains(): Promise<void> {
  const domains = await loadAllowlistedDomains();

  for (const domainInfo of domains) {
    try {
      await registerContentScriptForDomain(domainInfo.domain, domainInfo.pattern);
    } catch (error) {
      console.error(`Failed to initialize domain ${domainInfo.domain}:`, error);
    }
  }

  console.log(`Initialized ${domains.length} custom domains`);
}

/**
 * Check if domain is supported (built-in or allowlisted)
 */
function isBuiltInDomain(hostname: string): boolean {
  return hostname.endsWith('.atlassian.net') || hostname.endsWith('.jira.com');
}

async function isDomainSupported(hostname: string): Promise<boolean> {
  // Check if built-in
  if (isBuiltInDomain(hostname)) {
    return true;
  }

  // Check if allowlisted
  const domains = await loadAllowlistedDomains();
  return domains.some(d => d.domain === hostname);
}

/**
 * Update extension icon based on whether domain is supported
 */
async function updateIconForTab(tabId: number, url: string): Promise<void> {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const supported = await isDomainSupported(hostname);

    console.log(`[Icon Update] Tab ${tabId}, Domain: ${hostname}, Supported: ${supported}`);

    if (supported) {
      // Active state - clear badge
      await chrome.action.setBadgeText({ tabId, text: '' });
      console.log(`[Icon Update] Cleared badge for ${hostname}`);
    } else {
      // Inactive state - add badge to show inactive
      // Add a gray badge with "+" to indicate user can add domain
      await chrome.action.setBadgeText({ tabId, text: '+' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#999999' });
      console.log(`[Icon Update] Set inactive badge for ${hostname}`);
    }
  } catch (error) {
    // Not a valid URL or other error
    console.error('[Icon Update] Failed to update icon:', error, 'URL:', url);
  }
}

/**
 * Listen to tab updates to update icon state
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  console.log(`[Tab Updated] TabId: ${tabId}, Status: ${changeInfo.status}, URL: ${tab.url}`);
  if (changeInfo.status === 'complete' && tab.url) {
    await updateIconForTab(tabId, tab.url);
  }
});

/**
 * Listen to tab activation to update icon state
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log(`[Tab Activated] TabId: ${activeInfo.tabId}`);
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    await updateIconForTab(activeInfo.tabId, tab.url);
  }
});

/**
 * Listen to storage changes to update icons when domains are added/removed
 */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync' && changes['jira-plans-allowlisted-domains']) {
    // Domains changed, update icons for all tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url) {
        await updateIconForTab(tab.id, tab.url);
      }
    }
  }
});

/**
 * Listen for permission grants and auto-inject into existing tabs
 */
chrome.permissions.onAdded.addListener(async (permissions) => {
  console.log('[Service Worker] Permissions granted:', permissions.origins);

  if (!permissions.origins || permissions.origins.length === 0) {
    return;
  }

  // For each newly granted origin, check if it's in our allowlist and inject
  const domains = await loadAllowlistedDomains();

  for (const origin of permissions.origins) {
    // Extract domain from origin pattern (e.g., "*://example.com/*" -> "example.com")
    const domainMatch = origin.match(/\/\/([^/]+)\//);
    if (!domainMatch) continue;

    const domain = domainMatch[1];

    // Find matching domain in allowlist
    const domainInfo = domains.find(d => d.domain === domain);
    if (domainInfo) {
      console.log(`[Service Worker] Auto-injecting for ${domain}...`);
      const injectedCount = await registerContentScriptForDomain(domainInfo.domain, domainInfo.pattern);
      console.log(`[Service Worker] Injected into ${injectedCount} tab(s)`);
    }
  }
});

/**
 * Handle messages from popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ADD_DOMAIN_TO_ALLOWLIST') {
    handleAddDomain(message.domain, message.pattern)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: String(error) }));
    return true; // Async response
  }

  if (message.type === 'REMOVE_DOMAIN_FROM_ALLOWLIST') {
    handleRemoveDomain(message.domain)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: String(error) }));
    return true; // Async response
  }

  if (message.type === 'RE_REGISTER_DOMAIN') {
    // Re-register domain after host permissions are granted
    registerContentScriptForDomain(message.domain, message.pattern)
      .then(injectedCount => sendResponse({ success: true, injectedCount }))
      .catch(error => sendResponse({ success: false, error: String(error) }));
    return true; // Async response
  }

  if (message.type === 'GET_ALLOWLISTED_DOMAINS') {
    loadAllowlistedDomains()
      .then(domains => sendResponse({ success: true, domains }))
      .catch(error => sendResponse({ success: false, error: String(error) }));
    return true; // Async response
  }

  return false;
});

/**
 * Add domain to allowlist
 */
async function handleAddDomain(domain: string, pattern: string): Promise<{ success: boolean; error?: string; injectedCount?: number }> {
  try {
    const domains = await loadAllowlistedDomains();

    // Check if already exists
    if (domains.some(d => d.domain === domain)) {
      return { success: false, error: 'Domain already in allowlist' };
    }

    // Add to allowlist
    const newDomain: AllowlistedDomain = {
      domain,
      pattern,
      addedAt: Date.now(),
    };
    domains.push(newDomain);
    await saveAllowlistedDomains(domains);

    console.log(`[Service Worker] Domain ${domain} added to allowlist`);

    // Only register content script if we already have permissions
    // Otherwise, wait for chrome.permissions.onAdded event to handle it
    const hasPermissions = await chrome.permissions.contains({
      origins: [pattern],
    });

    let injectedCount = 0;
    if (hasPermissions) {
      console.log(`[Service Worker] Permissions already granted, registering now`);
      injectedCount = await registerContentScriptForDomain(domain, pattern);
    } else {
      console.log(`[Service Worker] No permissions yet, will register when permissions.onAdded fires`);
    }

    return { success: true, injectedCount };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Remove domain from allowlist
 */
async function handleRemoveDomain(domain: string): Promise<{ success: boolean; error?: string }> {
  try {
    const domains = await loadAllowlistedDomains();

    // Remove from allowlist
    const filtered = domains.filter(d => d.domain !== domain);
    await saveAllowlistedDomains(filtered);

    // Unregister content script
    await unregisterContentScriptForDomain(domain);

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Initialize on extension install/update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Service Worker] Jira Plans Enhanced installed/updated');
  await initializeAllowlistedDomains();

  // Update icons for all existing tabs
  const tabs = await chrome.tabs.query({});
  console.log(`[Service Worker] Updating icons for ${tabs.length} tabs`);
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      await updateIconForTab(tab.id, tab.url);
    }
  }
});

// Initialize on browser startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Service Worker] Jira Plans Enhanced startup');
  await initializeAllowlistedDomains();

  // Update icons for all existing tabs
  const tabs = await chrome.tabs.query({});
  console.log(`[Service Worker] Updating icons for ${tabs.length} tabs on startup`);
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      await updateIconForTab(tab.id, tab.url);
    }
  }
});

// Initialize immediately
console.log('[Service Worker] Initializing service worker...');
console.log('[Service Worker] Service worker script loaded successfully!');
console.log('[Service Worker] Chrome APIs available:', {
  storage: !!chrome.storage,
  tabs: !!chrome.tabs,
  action: !!chrome.action,
  scripting: !!chrome.scripting,
});

initializeAllowlistedDomains().then(async () => {
  console.log('[Service Worker] Initialization complete');

  // Update icons for all existing tabs
  const tabs = await chrome.tabs.query({});
  console.log(`[Service Worker] Updating icons for ${tabs.length} existing tabs`);
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      await updateIconForTab(tab.id, tab.url);
    }
  }
});
