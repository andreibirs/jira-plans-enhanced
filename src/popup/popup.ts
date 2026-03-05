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
let activationInProgress = false; // Prevents UI state reset during activation flow

/**
 * Check if content script is active on current tab
 */
async function isContentScriptActive(): Promise<boolean> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      return false;
    }

    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'PING' });
      return true;
    } catch (e) {
      return false;
    }
  } catch (error) {
    console.error('[Popup] Failed to check content script status:', error);
    return false;
  }
}

/**
 * Show/hide UI states based on whether extension is active
 */
function updateUIVisibility(isActive: boolean): void {
  const inactiveState = document.getElementById('inactiveState');
  const activeState = document.getElementById('activeState');

  if (inactiveState && activeState) {
    if (isActive) {
      inactiveState.style.display = 'none';
      activeState.style.display = 'block';
    } else {
      inactiveState.style.display = 'block';
      activeState.style.display = 'none';
    }
  }
}

/**
 * Update domain management section with current status
 */
async function updateDomainManagementSection(): Promise<void> {
  const activeDomain = document.getElementById('activeDomain');

  if (!activeDomain || !currentTabDomain) return;

  activeDomain.textContent = currentTabDomain;
}

/**
 * Initialize popup when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadCurrentDomain();
  await loadAllowlistedDomains();

  // Check if content script is active (skip if activation in progress to avoid race condition)
  if (!activationInProgress) {
    let isActive = await isContentScriptActive();

    // If not active, check permissions status
    if (!isActive && currentTabDomain) {
      const isDomainAllowlisted = await isDomainSupportedByTab();
      if (isDomainAllowlisted) {
        const pattern = createDomainPattern(currentTabDomain);
        const hasPermissions = await chrome.permissions.contains({
          origins: [pattern],
        });

        if (hasPermissions) {
          // Domain allowlisted AND has permissions but script not active yet
          // Service worker might still be injecting, wait and retry
          console.log('[Popup] Permissions granted but script not active, waiting for injection...');
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Check again
          isActive = await isContentScriptActive();
          if (!isActive) {
            console.log('[Popup] Still not active after wait, triggering manual injection');
            await injectContentScriptNow();
            isActive = await isContentScriptActive();
          }
        } else {
          // Domain allowlisted but no permissions - user denied, so remove domain
          console.log('[Popup] Cleaning up denied permission for', currentTabDomain);
          await chrome.runtime.sendMessage({
            type: 'REMOVE_DOMAIN_FROM_ALLOWLIST',
            domain: currentTabDomain,
          });
          await loadAllowlistedDomains();
        }
      }
    }

    // Update UI visibility based on active state
    updateUIVisibility(isActive);

    // Only load statistics and start polling if active
    if (isActive) {
      await updateDomainManagementSection();
      await refreshStatistics();
      startStatisticsPolling();
    }
  }

  setupEventListeners();
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

  // Update UI in both inactive and active states
  const inactiveDomainEl = document.getElementById('inactiveDomain');
  if (inactiveDomainEl) {
    inactiveDomainEl.textContent = currentTabDomain;
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
async function updateDomainStatus(isAllowlisted: boolean): Promise<void> {
  const statusBadge = document.getElementById('domainStatusBadge');
  const initialChoice = document.getElementById('initialChoice');
  const manualModeActive = document.getElementById('manualModeActive');
  const autoModeActive = document.getElementById('autoModeActive');

  if (!statusBadge) return;

  // Hide all sections first
  if (initialChoice) initialChoice.style.display = 'none';
  if (manualModeActive) manualModeActive.style.display = 'none';
  if (autoModeActive) autoModeActive.style.display = 'none';

  if (isAllowlisted) {
    // Check if we have host permissions for auto-activation
    if (currentTabDomain) {
      const pattern = createDomainPattern(currentTabDomain);
      const hasHostPermissions = await chrome.permissions.contains({
        origins: [pattern],
      });

      if (hasHostPermissions) {
        // Full auto-activation enabled
        statusBadge.textContent = 'Auto-activation enabled';
        statusBadge.className = 'status-badge allowlisted';
        if (autoModeActive) autoModeActive.style.display = 'block';
      } else {
        // Manual mode (activeTab only)
        statusBadge.textContent = 'Manual mode';
        statusBadge.className = 'status-badge manual';
        if (manualModeActive) manualModeActive.style.display = 'block';
      }
    }
  } else {
    // Not allowlisted - show initial choice
    statusBadge.textContent = 'Not allowlisted';
    statusBadge.className = 'status-badge not-allowlisted';
    if (initialChoice) initialChoice.style.display = 'block';
  }
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
 * Inject content script into current tab using activeTab permission
 * (No host permissions needed - activeTab grants temporary access)
 */
async function injectContentScriptNow(): Promise<boolean> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab?.id || !activeTab.url) {
      console.error('[Popup] No active tab found');
      alert('Error: No active tab found');
      return false;
    }

    console.log(`[Popup] Injecting into tab ${activeTab.id}: ${activeTab.url}`);

    // Check if content script is already injected
    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'PING' });
      console.log('[Popup] Content script already present, skipping injection');
      return true;
    } catch (e) {
      // Not injected yet, proceed
      console.log('[Popup] Content script not present, injecting...');
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content/content-script.js'],
      });

      console.log(`[Popup] Content script injected successfully`);

      // Wait for content script to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify injection worked
      try {
        const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'PING' });
        console.log('[Popup] Content script verified active');
        return true;
      } catch (verifyError) {
        console.error('[Popup] Content script injection verification failed:', verifyError);
        alert('Warning: Content script may not have loaded. Try refreshing the page.');
        return false;
      }
    } catch (injectError) {
      console.error('[Popup] Failed to execute script:', injectError);
      alert(`Failed to inject content script: ${injectError}`);
      return false;
    }
  } catch (error) {
    console.error('[Popup] Failed to inject content script:', error);
    alert(`Unexpected error: ${error}`);
    return false;
  }
}


/**
 * Activate extension for current domain
 * Adds domain to allowlist and requests permissions for auto-injection
 */
async function activateExtension(): Promise<void> {
  if (!currentTabDomain) return;

  activationInProgress = true;
  const pattern = createDomainPattern(currentTabDomain);

  try {
    setStatus(`Adding ${currentTabDomain}...`, 'loading');

    // Add to allowlist FIRST (before permission prompt which closes popup)
    const addResponse = await chrome.runtime.sendMessage({
      type: 'ADD_DOMAIN_TO_ALLOWLIST',
      domain: currentTabDomain,
      pattern,
    });

    if (!addResponse.success) {
      setStatus(`Failed: ${addResponse.error}`, 'disconnected');
      activationInProgress = false;
      return;
    }

    await loadAllowlistedDomains();
    setStatus('Requesting permissions...', 'loading');

    // Request host permissions (popup will close during this prompt)
    const granted = await chrome.permissions.request({
      origins: [pattern],
    });

    if (!granted) {
      setStatus('Permission denied', 'disconnected');
      activationInProgress = false;
      return;
    }

    // Service worker will auto-inject via chrome.permissions.onAdded event
    // This code may or may not run depending on if popup stayed open

    activationInProgress = false;
  } catch (error) {
    console.error('[Popup] Activation failed:', error);
    setStatus('Activation failed', 'disconnected');
    activationInProgress = false;
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

      // Also remove host permissions if granted
      const pattern = createDomainPattern(domain);
      try {
        await chrome.permissions.remove({
          origins: [pattern],
        });
      } catch (e) {
        console.log('[Popup] No permissions to remove');
      }

      await loadAllowlistedDomains();

      // If removing current domain, transition to inactive state
      if (domain === currentTabDomain) {
        console.log('[Popup] Removed current domain, transitioning to inactive state');
        updateUIVisibility(false);
        setStatus('Domain removed', 'disconnected');
      } else {
        setStatus('Domain removed', 'connected');
      }
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

  // Inactive state button
  const activateExtensionBtn = document.getElementById('activateExtension');
  activateExtensionBtn?.addEventListener('click', () => activateExtension());

  // Active state domain management button
  const removeDomain = document.getElementById('removeDomain');
  removeDomain?.addEventListener('click', () => {
    if (currentTabDomain) removeDomainFromAllowlist(currentTabDomain);
  });
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
 * (No-op: footer removed for cleaner UI)
 */
function setStatus(message: string, type: 'connected' | 'disconnected' | 'loading'): void {
  // Footer removed - status messages no longer displayed
  console.log(`[Popup Status] ${type}: ${message}`);
}

// Cleanup on popup close
window.addEventListener('beforeunload', () => {
  stopStatisticsPolling();
});
