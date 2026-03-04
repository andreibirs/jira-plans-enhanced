/* istanbul ignore file */
/**
 * Popup Logic for Jira Plans Enhanced
 *
 * Manages the popup UI, loads/saves settings, and communicates with content script.
 *
 * COVERAGE NOTE: This file is excluded from unit test coverage because it contains:
 * - UI event handlers that require real browser DOM
 * - Chrome extension API calls (chrome.storage, chrome.tabs, chrome.runtime)
 * - DOM manipulation and form interactions
 * - Async message passing between popup and content script
 *
 * This code should be validated through:
 * - Manual testing in Chrome extension environment
 * - E2E tests with Puppeteer/Playwright (future work)
 * - Integration tests in real Chrome popup context
 *
 * Unit testing this code in Jest/jsdom would require extensive mocking that
 * provides little confidence compared to manual/E2E validation.
 */

import {
  ExtensionSettings,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  mergeWithDefaults,
} from '../shared/settings';
import {
  ExtensionStatistics,
  formatAge,
  formatBytes,
  calculateHitRate,
} from '../shared/statistics';
import {
  PopupRequest,
  PopupResponse,
  isSuccessResponse,
} from '../shared/messages';

let currentSettings: ExtensionSettings = DEFAULT_SETTINGS;
let statisticsInterval: NodeJS.Timeout | null = null;
let currentTabDomain: string | null = null;

/**
 * Initialize popup when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadCurrentDomain();
  await loadAllowlistedDomains();
  setupEventListeners();
  await refreshStatistics();
  startStatisticsPolling();
});

/**
 * Load settings from chrome.storage.sync
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY);
    const storedSettings = result[SETTINGS_STORAGE_KEY] as Partial<ExtensionSettings> | undefined;

    if (storedSettings) {
      currentSettings = mergeWithDefaults(storedSettings);
    } else {
      currentSettings = DEFAULT_SETTINGS;
    }

    applySettingsToUI();
  } catch (error) {
    console.error('Failed to load settings:', error);
    setStatus('Failed to load settings', 'disconnected');
  }
}

/**
 * Save settings to chrome.storage.sync
 */
async function saveSettings(): Promise<void> {
  try {
    await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: currentSettings });
    setStatus('Settings saved', 'loading');
    setTimeout(() => setStatus('Connected to Jira Plans', 'connected'), 1500);
  } catch (error) {
    console.error('Failed to save settings:', error);
    setStatus('Failed to save settings', 'disconnected');
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Check if domain is a built-in supported domain (auto-injects)
 */
function isBuiltInDomain(domain: string): boolean {
  return domain.endsWith('.atlassian.net') || domain.endsWith('.jira.com');
}

/**
 * Create URL pattern for domain
 */
function createDomainPattern(domain: string): string {
  return `*://${domain}/*`;
}

/**
 * Load current tab domain and display in UI
 */
async function loadCurrentDomain(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab?.url) {
    return;
  }

  currentTabDomain = extractDomain(activeTab.url);

  if (!currentTabDomain) {
    return;
  }

  // Update UI
  const currentDomainEl = document.getElementById('currentDomain');
  if (currentDomainEl) {
    currentDomainEl.textContent = currentTabDomain;
  }

  // Check if this is a built-in domain
  if (isBuiltInDomain(currentTabDomain)) {
    const statusBadge = document.getElementById('domainStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = 'Built-in (auto-injects)';
      statusBadge.className = 'status-badge built-in';
    }
    // Hide the add button for built-in domains
    const toggleButton = document.getElementById('toggleDomainAllowlist');
    if (toggleButton) {
      toggleButton.style.display = 'none';
    }
  }
}

/**
 * Load allowlisted domains from background
 */
async function loadAllowlistedDomains(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ALLOWLISTED_DOMAINS' });

    if (response.success) {
      const domains = response.domains || [];
      updateAllowlistUI(domains);

      // Check if current domain is in allowlist
      if (currentTabDomain && !isBuiltInDomain(currentTabDomain)) {
        const isAllowlisted = domains.some((d: any) => d.domain === currentTabDomain);
        updateDomainStatus(isAllowlisted);
      }
    }
  } catch (error) {
    console.error('Failed to load allowlisted domains:', error);
  }
}

/**
 * Update domain status UI
 */
function updateDomainStatus(isAllowlisted: boolean): void {
  const statusBadge = document.getElementById('domainStatusBadge');
  const toggleButton = document.getElementById('toggleDomainAllowlist') as HTMLButtonElement;
  const domainHelp = document.getElementById('domainHelp');

  if (!statusBadge || !toggleButton) return;

  if (isAllowlisted) {
    statusBadge.textContent = 'Allowlisted (auto-injects)';
    statusBadge.className = 'status-badge allowlisted';
    toggleButton.textContent = 'Remove from auto-injection';
    toggleButton.className = 'btn btn-secondary';
    if (domainHelp) domainHelp.style.display = 'none';
  } else {
    statusBadge.textContent = 'Not allowlisted';
    statusBadge.className = 'status-badge not-allowlisted';
    toggleButton.textContent = 'Add to allowlist';
    toggleButton.className = 'btn btn-primary';
    if (domainHelp) domainHelp.style.display = 'block';
  }

  toggleButton.style.display = 'block';
}

/**
 * Update allowlist UI with domains
 */
function updateAllowlistUI(domains: any[]): void {
  const allowlistSection = document.getElementById('allowlistSection');
  const allowlistContainer = document.getElementById('allowlistContainer');

  if (!allowlistContainer || !allowlistSection) return;

  if (domains.length === 0) {
    allowlistContainer.innerHTML = '<p class="no-domains">No custom domains added yet</p>';
    allowlistSection.style.display = 'none';
  } else {
    allowlistSection.style.display = 'block';
    allowlistContainer.innerHTML = domains
      .map(
        (d: any) => `
      <div class="allowlist-item">
        <span class="domain-name">${d.domain}</span>
        <button class="btn-remove" data-domain="${d.domain}">×</button>
      </div>
    `
      )
      .join('');

    // Add remove handlers
    const removeButtons = allowlistContainer.querySelectorAll('.btn-remove');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const domain = (e.target as HTMLElement).getAttribute('data-domain');
        if (domain) {
          await removeDomainFromAllowlist(domain);
        }
      });
    });
  }
}

/**
 * Toggle current domain in allowlist
 */
async function toggleCurrentDomainAllowlist(): Promise<void> {
  if (!currentTabDomain) return;

  // Check current status
  const response = await chrome.runtime.sendMessage({ type: 'GET_ALLOWLISTED_DOMAINS' });
  if (!response.success) return;

  const domains = response.domains || [];
  const isAllowlisted = domains.some((d: any) => d.domain === currentTabDomain);

  if (isAllowlisted) {
    await removeDomainFromAllowlist(currentTabDomain);
  } else {
    await addDomainToAllowlist(currentTabDomain);
  }
}

/**
 * Inject content script into current tab
 */
async function injectContentScriptNow(): Promise<boolean> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content/content-script.js'],
    });

    // Wait for content script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  } catch (error) {
    console.error('Failed to inject content script:', error);
    return false;
  }
}

/**
 * Add domain to allowlist
 */
async function addDomainToAllowlist(domain: string): Promise<void> {
  const pattern = createDomainPattern(domain);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ADD_DOMAIN_TO_ALLOWLIST',
      domain,
      pattern,
    });

    if (response.success) {
      setStatus(`Added ${domain}, activating...`, 'loading');
      await loadAllowlistedDomains();

      // Icon should update automatically via storage.onChanged listener in background
      // Give it a moment to update
      await new Promise(resolve => setTimeout(resolve, 200));

      // Inject content script immediately so user doesn't need to refresh
      const injected = await injectContentScriptNow();

      if (injected) {
        setStatus('Connected to Jira Plans', 'connected');
        // Refresh statistics to show badges are working
        await refreshStatistics();
      } else {
        setStatus('Added. Please refresh the page.', 'loading');
      }
    } else {
      setStatus(`Failed: ${response.error}`, 'disconnected');
    }
  } catch (error) {
    console.error('Failed to add domain:', error);
    setStatus('Failed to add domain', 'disconnected');
  }
}

/**
 * Remove domain from allowlist
 */
async function removeDomainFromAllowlist(domain: string): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'REMOVE_DOMAIN_FROM_ALLOWLIST',
      domain,
    });

    if (response.success) {
      setStatus(`Removed ${domain} from auto-injection`, 'loading');
      await loadAllowlistedDomains();
      setTimeout(() => setStatus('Connected to Jira Plans', 'connected'), 1500);
    } else {
      setStatus(`Failed: ${response.error}`, 'disconnected');
    }
  } catch (error) {
    console.error('Failed to remove domain:', error);
    setStatus('Failed to remove domain', 'disconnected');
  }
}

/**
 * Apply current settings to UI controls
 */
function applySettingsToUI(): void {
  // Quick toggles
  const showLeftPanelBadges = document.getElementById('showLeftPanelBadges') as HTMLInputElement;
  const showTimelineBadges = document.getElementById('showTimelineBadges') as HTMLInputElement;
  const showSprintSpecificBadges = document.getElementById('showSprintSpecificBadges') as HTMLInputElement;
  const showZeroCountBadges = document.getElementById('showZeroCountBadges') as HTMLInputElement;

  if (showLeftPanelBadges) showLeftPanelBadges.checked = currentSettings.display.showLeftPanelBadges;
  if (showTimelineBadges) showTimelineBadges.checked = currentSettings.display.showTimelineBadges;
  if (showSprintSpecificBadges) showSprintSpecificBadges.checked = currentSettings.display.showSprintSpecificBadges;
  if (showZeroCountBadges) showZeroCountBadges.checked = currentSettings.display.showZeroCountBadges;

  // Settings preview
  updateSettingsPreview();
}

/**
 * Update settings preview section
 */
function updateSettingsPreview(): void {
  const cacheTtl = document.getElementById('cacheTtl');
  const debounceDelay = document.getElementById('debounceDelay');
  const badgeTheme = document.getElementById('badgeTheme');

  if (cacheTtl) {
    const minutes = Math.floor(currentSettings.performance.cacheTtlMs / 60000);
    cacheTtl.textContent = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  if (debounceDelay) {
    debounceDelay.textContent = `${currentSettings.performance.debounceDelayMs}ms`;
  }

  if (badgeTheme) {
    const theme = currentSettings.appearance.badgeTheme;
    badgeTheme.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
  }
}

/**
 * Setup event listeners for UI controls
 */
function setupEventListeners(): void {
  // Quick toggles
  const showLeftPanelBadges = document.getElementById('showLeftPanelBadges') as HTMLInputElement;
  const showTimelineBadges = document.getElementById('showTimelineBadges') as HTMLInputElement;
  const showSprintSpecificBadges = document.getElementById('showSprintSpecificBadges') as HTMLInputElement;
  const showZeroCountBadges = document.getElementById('showZeroCountBadges') as HTMLInputElement;

  showLeftPanelBadges?.addEventListener('change', () => {
    currentSettings.display.showLeftPanelBadges = showLeftPanelBadges.checked;
    saveSettings();
  });

  showTimelineBadges?.addEventListener('change', () => {
    currentSettings.display.showTimelineBadges = showTimelineBadges.checked;
    saveSettings();
  });

  showSprintSpecificBadges?.addEventListener('change', () => {
    currentSettings.display.showSprintSpecificBadges = showSprintSpecificBadges.checked;
    saveSettings();
  });

  showZeroCountBadges?.addEventListener('change', () => {
    currentSettings.display.showZeroCountBadges = showZeroCountBadges.checked;
    saveSettings();
  });

  // Cache controls
  const clearCache = document.getElementById('clearCache');
  const refreshCache = document.getElementById('refreshCache');
  const clearEpicCache = document.getElementById('clearEpicCache');

  clearCache?.addEventListener('click', handleClearCache);
  refreshCache?.addEventListener('click', handleRefreshCache);
  clearEpicCache?.addEventListener('click', handleClearEpicCache);

  // Advanced settings
  const openAdvancedSettings = document.getElementById('openAdvancedSettings');
  openAdvancedSettings?.addEventListener('click', () => {
    // TODO: Open advanced settings page
    alert('Advanced settings coming soon!');
  });

  // Domain allowlist toggle
  const toggleDomainAllowlist = document.getElementById('toggleDomainAllowlist');
  toggleDomainAllowlist?.addEventListener('click', toggleCurrentDomainAllowlist);
}

/**
 * Send message to content script and get response
 * Content script must already be loaded (either via built-in domains or allowlisted domains)
 */
async function sendMessageToContentScript(message: PopupRequest): Promise<PopupResponse> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab?.id) {
    return { type: 'ERROR', success: false, error: 'No active tab found' };
  }

  // Check if current tab is a special page (extensions, chrome://, etc.)
  if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('chrome-extension://')) {
    return { type: 'ERROR', success: false, error: 'Content script not available on this page' };
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, message);
    return response as PopupResponse;
  } catch (error) {
    // Content script not loaded - this is expected on non-Jira pages
    // Don't log as error to avoid confusion
    return { type: 'ERROR', success: false, error: 'Content script not loaded on this page' };
  }
}

/**
 * Refresh statistics from content script
 */
async function refreshStatistics(): Promise<void> {
  const response = await sendMessageToContentScript({ type: 'GET_STATISTICS' });

  if (isSuccessResponse(response) && response.type === 'GET_STATISTICS_RESPONSE') {
    updateStatisticsUI(response.statistics);
  } else {
    // Content script not available - check if we're on a Jira page
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (activeTab?.url?.startsWith('chrome://') || activeTab?.url?.startsWith('chrome-extension://')) {
      setStatus('Open a Jira Plans page to see statistics', 'disconnected');
    } else if (currentTabDomain) {
      const isSupported = await isDomainSupportedByTab();
      if (isSupported) {
        setStatus('Loading... Please wait', 'loading');
      } else {
        setStatus('Add this domain to use the extension', 'disconnected');
      }
    } else {
      setStatus('Not connected to Jira Plans', 'disconnected');
    }
  }
}

/**
 * Check if current tab domain is supported
 */
async function isDomainSupportedByTab(): Promise<boolean> {
  if (!currentTabDomain) return false;

  // Check if built-in
  if (isBuiltInDomain(currentTabDomain)) return true;

  // Check if allowlisted
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ALLOWLISTED_DOMAINS' });
    if (response.success) {
      const domains = response.domains || [];
      return domains.some((d: any) => d.domain === currentTabDomain);
    }
  } catch (error) {
    console.error('Failed to check domain support:', error);
  }

  return false;
}

/**
 * Update statistics UI with latest data
 */
function updateStatisticsUI(stats: ExtensionStatistics): void {
  // Cache stats
  const cacheEntries = document.getElementById('cacheEntries');
  const cacheHitRate = document.getElementById('cacheHitRate');
  const cacheSize = document.getElementById('cacheSize');
  const cacheAgeRange = document.getElementById('cacheAgeRange');

  if (cacheEntries) {
    cacheEntries.textContent = `${stats.cache.totalEntries} / ${stats.cache.maxEntries}`;
  }

  if (cacheHitRate) {
    const hitRate = calculateHitRate(stats.cache.hitCount, stats.cache.missCount);
    cacheHitRate.textContent = `${hitRate.toFixed(1)}%`;
  }

  if (cacheSize) {
    cacheSize.textContent = formatBytes(stats.cache.estimatedSizeBytes);
  }

  if (cacheAgeRange) {
    if (stats.cache.totalEntries > 0) {
      const oldest = formatAge(stats.cache.oldestEntryAge);
      const newest = formatAge(stats.cache.newestEntryAge);
      cacheAgeRange.textContent = `${oldest} - ${newest}`;
    } else {
      cacheAgeRange.textContent = '-';
    }
  }

  // Processing stats
  const epicsProcessed = document.getElementById('epicsProcessed');
  const badgesInjected = document.getElementById('badgesInjected');
  const apiCalls = document.getElementById('apiCalls');
  const processingTime = document.getElementById('processingTime');

  if (epicsProcessed) {
    epicsProcessed.textContent = String(stats.processing.epicsProcessed);
  }

  if (badgesInjected) {
    badgesInjected.textContent = String(stats.processing.badgesInjected);
  }

  if (apiCalls) {
    apiCalls.textContent = `${stats.processing.apiCallsMade} (${stats.processing.apiCallsFailed} failed)`;
  }

  if (processingTime) {
    processingTime.textContent = `${stats.processing.averageProcessingTimeMs.toFixed(1)}ms avg`;
  }

  // Badge stats
  const leftPanelBadges = document.getElementById('leftPanelBadges');
  const timelineBadges = document.getElementById('timelineBadges');
  const sprintBadges = document.getElementById('sprintBadges');

  if (leftPanelBadges) {
    leftPanelBadges.textContent = String(stats.badges.leftPanelBadgesActive);
  }

  if (timelineBadges) {
    timelineBadges.textContent = String(stats.badges.timelineBadgesActive);
  }

  if (sprintBadges) {
    sprintBadges.textContent = String(stats.badges.sprintBadgesActive);
  }

  // Error stats
  const apiErrors = document.getElementById('apiErrors');
  const lastError = document.getElementById('lastError');

  if (apiErrors) {
    apiErrors.textContent = String(stats.errors.apiErrors);
  }

  if (lastError) {
    if (stats.errors.lastErrorMessage && stats.errors.lastErrorTime) {
      const errorAge = Date.now() - stats.errors.lastErrorTime;
      lastError.textContent = `${stats.errors.lastErrorMessage.substring(0, 30)}... (${formatAge(errorAge)} ago)`;
      lastError.title = stats.errors.lastErrorMessage;
    } else {
      lastError.textContent = 'None';
      lastError.title = '';
    }
  }

  setStatus('Connected to Jira Plans', 'connected');
}

/**
 * Start polling statistics every 2 seconds
 */
function startStatisticsPolling(): void {
  if (statisticsInterval) {
    clearInterval(statisticsInterval);
  }

  statisticsInterval = setInterval(refreshStatistics, 2000);
}

/**
 * Stop polling statistics
 */
function stopStatisticsPolling(): void {
  if (statisticsInterval) {
    clearInterval(statisticsInterval);
    statisticsInterval = null;
  }
}

/**
 * Handle clear cache button
 */
async function handleClearCache(): Promise<void> {
  const response = await sendMessageToContentScript({ type: 'CLEAR_CACHE' });

  if (isSuccessResponse(response) && response.type === 'CLEAR_CACHE_RESPONSE') {
    setStatus(`Cleared ${response.clearedCount} cache entries`, 'loading');
    await refreshStatistics();
  } else {
    setStatus('Failed to clear cache', 'disconnected');
  }
}

/**
 * Handle refresh cache button
 */
async function handleRefreshCache(): Promise<void> {
  const response = await sendMessageToContentScript({ type: 'REFRESH_CACHE', forceRefresh: true });

  if (isSuccessResponse(response) && response.type === 'REFRESH_CACHE_RESPONSE') {
    setStatus(`Refreshed ${response.refreshedCount} epics`, 'loading');
    await refreshStatistics();
  } else {
    setStatus('Failed to refresh cache', 'disconnected');
  }
}

/**
 * Handle clear epic cache button
 */
async function handleClearEpicCache(): Promise<void> {
  const epicKeyInput = document.getElementById('epicKeyInput') as HTMLInputElement;
  const epicKey = epicKeyInput?.value.trim();

  if (!epicKey) {
    alert('Please enter an epic key (e.g., PROJ-123)');
    return;
  }

  const response = await sendMessageToContentScript({ type: 'CLEAR_CACHE', epicKey });

  if (isSuccessResponse(response) && response.type === 'CLEAR_CACHE_RESPONSE') {
    setStatus(`Cleared cache for ${epicKey}`, 'loading');
    epicKeyInput.value = '';
    await refreshStatistics();
  } else {
    setStatus(`Failed to clear cache for ${epicKey}`, 'disconnected');
  }
}

/**
 * Update status message and indicator
 */
function setStatus(message: string, type: 'connected' | 'disconnected' | 'loading'): void {
  const status = document.getElementById('connectionStatus');
  if (status) {
    status.textContent = message;
    status.className = `status ${type}`;
  }
}

// Cleanup on popup close
window.addEventListener('beforeunload', () => {
  stopStatisticsPolling();
});
