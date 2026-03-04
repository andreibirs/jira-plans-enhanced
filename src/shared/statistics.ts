/**
 * Extension Statistics Schema
 *
 * Tracks runtime metrics for monitoring extension health and performance.
 * Statistics are collected in the content script and exposed to the popup.
 */

export interface ExtensionStatistics {
  cache: {
    totalEntries: number;
    maxEntries: number;
    hitCount: number;
    missCount: number;
    hitRate: number;                 // Calculated: hitCount / (hitCount + missCount)
    estimatedSizeBytes: number;
    oldestEntryAge: number;          // Milliseconds
    newestEntryAge: number;          // Milliseconds
    lastClearTimestamp: number | null;
  };
  processing: {
    epicsProcessed: number;
    badgesInjected: number;
    badgesUpdated: number;
    apiCallsMade: number;
    apiCallsFailed: number;
    averageProcessingTimeMs: number;
    lastProcessingTimeMs: number;
    totalProcessingRuns: number;
  };
  badges: {
    leftPanelBadgesActive: number;
    timelineBadgesActive: number;
    sprintBadgesActive: number;
    zeroCountBadges: number;
    loadingBadges: number;
  };
  errors: {
    apiErrors: number;
    domParsingErrors: number;
    badgeInjectionErrors: number;
    lastErrorMessage: string | null;
    lastErrorTime: number | null;
  };
}

/**
 * Initial statistics state (all zeros)
 */
export const INITIAL_STATISTICS: ExtensionStatistics = {
  cache: {
    totalEntries: 0,
    maxEntries: 0,
    hitCount: 0,
    missCount: 0,
    hitRate: 0,
    estimatedSizeBytes: 0,
    oldestEntryAge: 0,
    newestEntryAge: 0,
    lastClearTimestamp: null,
  },
  processing: {
    epicsProcessed: 0,
    badgesInjected: 0,
    badgesUpdated: 0,
    apiCallsMade: 0,
    apiCallsFailed: 0,
    averageProcessingTimeMs: 0,
    lastProcessingTimeMs: 0,
    totalProcessingRuns: 0,
  },
  badges: {
    leftPanelBadgesActive: 0,
    timelineBadgesActive: 0,
    sprintBadgesActive: 0,
    zeroCountBadges: 0,
    loadingBadges: 0,
  },
  errors: {
    apiErrors: 0,
    domParsingErrors: 0,
    badgeInjectionErrors: 0,
    lastErrorMessage: null,
    lastErrorTime: null,
  },
};

/**
 * Helper to format milliseconds into human-readable time
 */
export function formatAge(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Helper to format bytes into human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/**
 * Helper to calculate hit rate percentage
 */
export function calculateHitRate(hits: number, misses: number): number {
  const total = hits + misses;
  return total > 0 ? (hits / total) * 100 : 0;
}
