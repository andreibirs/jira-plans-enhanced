/**
 * Extension Settings Schema
 *
 * Defines all user-configurable settings for Jira Plans Enhanced.
 * Settings are stored in chrome.storage.sync and applied across all browser instances.
 */

export interface ExtensionSettings {
  display: {
    showLeftPanelBadges: boolean;
    showTimelineBadges: boolean;
    showSprintSpecificBadges: boolean;
    showZeroCountBadges: boolean;
    showLoadingState: boolean;
    showStoryAvatars: boolean;
  };
  appearance: {
    badgeDisplayMode: 'count' | 'avatars' | 'personweeks';
    spThresholdPerPw: number;  // SP ceiling for 1 PW, above = 2 PW (default 5)
    pdThresholdPerPw: number;  // Person-days ceiling for 1 PW, above = 2 PW (default 4)
    pwSource: 'stories' | 'epic' | 'epic-fallback'; // PW data source: stories only, epic only, or epic with story fallback
    maxVisibleAvatars: number; // 2-8, default 4
    badgeTheme: 'auto' | 'light' | 'dark' | 'custom';
    leftPanelBadgeSize: 'small' | 'normal' | 'large';
    timelineBadgeSize: 'small' | 'normal' | 'large';
    timelineBadgePosition: 'left' | 'center' | 'right';
    customBackgroundColor: string;
    customTextColor: string;
    fontSizeOverride: number | null;
  };
  performance: {
    debounceDelayMs: number;        // 100-2000
    cacheTtlMs: number;              // 60000-1800000 (1-30 min)
    maxCacheEntries: number;         // 50-500
    apiTimeoutMs: number;            // 3000-30000
    apiMaxResults: number;           // 100-1000
    enableCache: boolean;
  };
  filters: {
    viewMode: 'auto' | 'sprint' | 'roadmap';
    sprintStatusFilter: 'all' | 'active' | 'future' | 'closed';
    minimumHeadcount: number;        // 0-50
    hideEmptyEpics: boolean;
  };
  debug: {
    enableDebugMode: boolean;
    logApiRequests: boolean;
    logDomChanges: boolean;
    logBadgeOperations: boolean;
    performanceProfiling: boolean;
  };
}

/**
 * Default settings matching current hardcoded behavior
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  display: {
    showLeftPanelBadges: true,
    showTimelineBadges: true,
    showSprintSpecificBadges: true,
    showZeroCountBadges: false,
    showLoadingState: true,
    showStoryAvatars: true,
  },
  appearance: {
    badgeDisplayMode: 'count',
    spThresholdPerPw: 5,
    pdThresholdPerPw: 4,
    pwSource: 'stories' as const,
    maxVisibleAvatars: 4,
    badgeTheme: 'auto',
    leftPanelBadgeSize: 'normal',
    timelineBadgeSize: 'normal',
    timelineBadgePosition: 'center',
    customBackgroundColor: '#e0e0e0',
    customTextColor: '#333333',
    fontSizeOverride: null,
  },
  performance: {
    debounceDelayMs: 500,
    cacheTtlMs: 300000,    // 5 minutes
    maxCacheEntries: 100,
    apiTimeoutMs: 5000,
    apiMaxResults: 1000,
    enableCache: true,
  },
  filters: {
    viewMode: 'auto',
    sprintStatusFilter: 'all',
    minimumHeadcount: 0,
    hideEmptyEpics: false,
  },
  debug: {
    enableDebugMode: false,
    logApiRequests: false,
    logDomChanges: false,
    logBadgeOperations: false,
    performanceProfiling: false,
  },
};

/**
 * Storage key for settings in chrome.storage.sync
 */
export const SETTINGS_STORAGE_KEY = 'jira-plans-headcount-settings';

/**
 * Helper to merge partial settings with defaults
 */
export function mergeWithDefaults(partial: Partial<ExtensionSettings>): ExtensionSettings {
  // Migrate old epicLevelPw/epicEstimateTrumpsStories booleans → pwSource
  const appearance = partial.appearance as Record<string, unknown> | undefined;
  if (appearance && !appearance.pwSource && appearance.epicLevelPw) {
    appearance.pwSource = appearance.epicEstimateTrumpsStories === false ? 'epic-fallback' : 'epic';
    delete appearance.epicLevelPw;
    delete appearance.epicEstimateTrumpsStories;
  }

  return {
    display: { ...DEFAULT_SETTINGS.display, ...partial.display },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...partial.appearance },
    performance: { ...DEFAULT_SETTINGS.performance, ...partial.performance },
    filters: { ...DEFAULT_SETTINGS.filters, ...partial.filters },
    debug: { ...DEFAULT_SETTINGS.debug, ...partial.debug },
  };
}
