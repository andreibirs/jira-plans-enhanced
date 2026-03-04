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
 * Register content script for a domain pattern
 */
async function registerContentScriptForDomain(domain: string, pattern: string): Promise<void> {
  const scriptId = `custom-domain-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;

  try {
    // Unregister if already exists
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
    } catch (e) {
      // Ignore if doesn't exist
    }

    // Register new content script
    await chrome.scripting.registerContentScripts([
      {
        id: scriptId,
        matches: [pattern],
        js: ['content/content-script.js'],
        runAt: 'document_end',
      },
    ]);

    console.log(`Registered content script for domain: ${domain}`);
  } catch (error) {
    console.error(`Failed to register content script for ${domain}:`, error);
    throw error;
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
async function handleAddDomain(domain: string, pattern: string): Promise<{ success: boolean; error?: string }> {
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

    // Register content script
    await registerContentScriptForDomain(domain, pattern);

    return { success: true };
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
