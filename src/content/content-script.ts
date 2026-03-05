/**
 * Content Script for Jira Plans Enhanced
 *
 * Simplified DOM-only approach:
 * - Monitor Jira Plans page for epic elements (MutationObserver)
 * - Extract assignee data from visible DOM
 * - Inject badge UI adjacent to epic titles
 * - Update badges when epics expand/collapse
 */

import { findEpicRows, extractEpicData } from './dom-parser';
import { injectSprintBadges, injectTimelineBadge, injectBadge, updateBadge, countBadges, clearAllBadges, clearTimelineBadges, BADGE_CLASS, TIMELINE_BADGE_CLASS } from './badge';
import { getSprintLayout, getOverlappingSprints, calculateBadgePosition, SprintSegment, normalizeSprintName } from './sprint-layout';
import { ExtensionSettings, DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, mergeWithDefaults } from '../shared/settings';
import { ExtensionStatistics, INITIAL_STATISTICS, calculateHitRate } from '../shared/statistics';
import { PopupRequest, PopupResponse, isPopupRequest } from '../shared/messages';

export interface ProcessResult {
  processed: number;
  injected: number;
}

// Cache for API results to avoid spamming Jira
// Key: epicKey (e.g., "PROJ-123"), Value: {totalCount, sprintCounts, timestamp, unscheduledStories, assigneeNames}
interface CachedAssigneeData {
  totalCount: number;
  sprintCounts: Map<string, number>; // sprintName -> count
  timestamp: number; // CRITICAL: Add timestamp for TTL checking
  unscheduledStories?: string[]; // Story keys not assigned to any sprint
  sprintAssignees: Map<string, string[]>; // sprintName -> assignee names
  totalAssignees: string[]; // All assignee names for this epic
}
const assigneeCountCache = new Map<string, CachedAssigneeData>();

// Track which epics we're currently fetching to avoid duplicate requests
const inflightRequests = new Set<string>();

// Cache sprint layouts per team (key: teamId, value: sprint segments)
const sprintLayoutCache = new Map<string, SprintSegment[]>();

// Current settings and statistics
let currentSettings: ExtensionSettings = DEFAULT_SETTINGS;
const statistics: ExtensionStatistics = { ...INITIAL_STATISTICS };
const processingTimes: number[] = []; // Track last 100 processing times for average

// Track if ResizeObserver has been set up
let resizeObserverSetup = false;
let resizeObserver: ResizeObserver | null = null;

/**
 * CRITICAL: Check if cache entry has expired based on TTL
 */
function isCacheExpired(epicKey: string): boolean {
  const cached = assigneeCountCache.get(epicKey);
  if (!cached) return true;

  const age = Date.now() - cached.timestamp;
  return age > currentSettings.performance.cacheTtlMs;
}

/**
 * CRITICAL: Evict oldest cache entry when cache exceeds max size
 * Uses LRU (Least Recently Used) eviction policy
 */
function evictOldestCacheEntry(): void {
  if (assigneeCountCache.size <= currentSettings.performance.maxCacheEntries) {
    return;
  }

  let oldestKey: string | null = null;
  let oldestTimestamp = Date.now();

  for (const [key, data] of assigneeCountCache.entries()) {
    if (data.timestamp < oldestTimestamp) {
      oldestTimestamp = data.timestamp;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    assigneeCountCache.delete(oldestKey);
    statistics.cache.totalEntries--;
    if (currentSettings.debug.enableDebugMode) {
      console.log(`[Headcount] Evicted oldest cache entry: ${oldestKey}`);
    }
  }
}

/**
 * Update cache statistics and badge counts
 */
function updateCacheStatistics(): void {
  statistics.cache.totalEntries = assigneeCountCache.size;
  statistics.cache.maxEntries = currentSettings.performance.maxCacheEntries;

  // Calculate hit rate
  statistics.cache.hitRate = calculateHitRate(
    statistics.cache.hitCount,
    statistics.cache.missCount
  );

  // Calculate age range
  let oldestAge = 0;
  let newestAge = 0;

  if (assigneeCountCache.size > 0) {
    const now = Date.now();
    let oldestTimestamp = now;
    let newestTimestamp = 0;

    for (const data of assigneeCountCache.values()) {
      if (data.timestamp < oldestTimestamp) {
        oldestTimestamp = data.timestamp;
      }
      if (data.timestamp > newestTimestamp) {
        newestTimestamp = data.timestamp;
      }
    }

    oldestAge = now - oldestTimestamp;
    newestAge = now - newestTimestamp;
  }

  statistics.cache.oldestEntryAge = oldestAge;
  statistics.cache.newestEntryAge = newestAge;

  // Estimate cache size (rough approximation)
  statistics.cache.estimatedSizeBytes = assigneeCountCache.size * 200; // ~200 bytes per entry

  // Count actual badges in the DOM
  const badgeCounts = countBadges();
  statistics.badges.leftPanelBadgesActive = badgeCounts.leftPanel;
  statistics.badges.timelineBadgesActive = badgeCounts.timeline;
  statistics.badges.sprintBadgesActive = badgeCounts.sprint;
}

/**
 * Record error in statistics
 */
function recordError(type: 'api' | 'domParsing' | 'badgeInjection', message: string): void {
  if (type === 'api') {
    statistics.errors.apiErrors++;
  } else if (type === 'domParsing') {
    statistics.errors.domParsingErrors++;
  } else if (type === 'badgeInjection') {
    statistics.errors.badgeInjectionErrors++;
  }

  statistics.errors.lastErrorMessage = message;
  statistics.errors.lastErrorTime = Date.now();

  if (currentSettings.debug.enableDebugMode) {
    console.error(`[Headcount] ${type} error:`, message);
  }
}

/**
 * Apply display settings to show/hide badges in the DOM
 */
function applyDisplaySettings(): void {
  // Left panel badges
  const leftPanelBadges = document.querySelectorAll(`.${BADGE_CLASS}`);
  leftPanelBadges.forEach((badge: Element) => {
    const htmlBadge = badge as HTMLElement;
    const isZeroCount = htmlBadge.hasAttribute('data-zero-count');

    // Check both settings: showLeftPanelBadges AND showZeroCountBadges
    let shouldShow = currentSettings.display.showLeftPanelBadges;
    if (isZeroCount && !currentSettings.display.showZeroCountBadges) {
      shouldShow = false;
    }

    htmlBadge.style.display = shouldShow ? 'inline-block' : 'none';
  });

  // Timeline badges (including sprint-specific)
  const timelineBadges = document.querySelectorAll(`.${TIMELINE_BADGE_CLASS}`);
  timelineBadges.forEach((badge: Element) => {
    const htmlBadge = badge as HTMLElement;
    const sprintName = htmlBadge.getAttribute('data-sprint');
    const isSprint = !!sprintName;
    const isWarning = sprintName === '__NO_SPRINT__';
    const isZeroCount = htmlBadge.hasAttribute('data-zero-count');

    let shouldShow = false;

    if (isWarning) {
      // WARNING BADGE: Always show if timeline badges are enabled, regardless of sprint-specific toggle
      shouldShow = currentSettings.display.showTimelineBadges;
    } else if (isSprint) {
      // Sprint-specific badge - only show if BOTH timeline badges AND sprint-specific are enabled
      shouldShow = currentSettings.display.showTimelineBadges && currentSettings.display.showSprintSpecificBadges;
    } else {
      // Regular timeline badge (roadmap view OR sprint view with toggle OFF)
      shouldShow = currentSettings.display.showTimelineBadges;
    }

    // Hide zero-count badges if setting is disabled (even warning badges)
    if (isZeroCount && !currentSettings.display.showZeroCountBadges) {
      shouldShow = false;
    }

    htmlBadge.style.display = shouldShow ? 'inline-block' : 'none';
  });

  if (currentSettings.debug.logBadgeOperations) {
    console.log('[Headcount] Applied display settings to badges');
  }
}

/**
 * Load settings from chrome.storage.sync
 *
 * COVERAGE NOTE: Excluded from coverage - Chrome extension API integration.
 * Testing requires mocking chrome.storage.sync and chrome.storage.onChanged.
 * Better validated through integration tests in real Chrome environment.
 */
/* istanbul ignore next */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY);
    const storedSettings = result[SETTINGS_STORAGE_KEY] as Partial<ExtensionSettings> | undefined;

    if (storedSettings) {
      currentSettings = mergeWithDefaults(storedSettings);
    } else {
      currentSettings = DEFAULT_SETTINGS;
    }

    if (currentSettings.debug.enableDebugMode) {
      console.log('[Headcount] Settings loaded:', currentSettings);
    }
  } catch (error) {
    console.error('[Headcount] Failed to load settings:', error);
  }
}

/**
 * Parse sprint name from Jira's sprint field format
 * Format: "com.atlassian.greenhopper.service.sprint.Sprint@hash[id=209802,rapidViewId=45164,state=ACTIVE,name=Sprint 45,...]"
 */
function parseSprintName(sprintStr: string): string | null {
  if (typeof sprintStr !== 'string') {
    return null;
  }

  // Extract name from the Sprint object string
  const nameMatch = sprintStr.match(/name=([^,\]]+)/);
  if (nameMatch && nameMatch[1]) {
    return nameMatch[1].trim();
  }

  return null;
}

/**
 * Process all epic rows on the page and inject/update badges
 */
export function processEpics(): ProcessResult {
  const startTime = performance.now();

  const epicRows = findEpicRows();
  let processed = 0;
  let injected = 0;

  for (const epicRow of epicRows) {
    processed++;

    try {
      const epicData = extractEpicData(epicRow);
      if (!epicData || !epicData.epicKey) {
        continue;
      }

      const epicKey = epicData.epicKey;
      const issueId = epicRow.getAttribute('data-issue');
      if (!issueId) {
        continue;
      }

      const cachedData = assigneeCountCache.get(epicKey);

      // CRITICAL: Check if cache is expired or missing
      if (!cachedData || isCacheExpired(epicKey)) {
        if (cachedData && isCacheExpired(epicKey)) {
          // Cache expired - remove it
          assigneeCountCache.delete(epicKey);
          statistics.cache.totalEntries--;
          statistics.cache.missCount++;
        } else if (!cachedData) {
          statistics.cache.missCount++;
        }

        // Fetch fresh data if not already in flight
        if (!inflightRequests.has(epicKey)) {
          fetchAccurateCount(epicRow, epicKey, issueId);
        }
      } else {
        // Cache hit
        statistics.cache.hitCount++;

        // Inject or update left panel badge (next to epic key)
        if (currentSettings.display.showLeftPanelBadges) {
          if (cachedData.totalCount > 0 || currentSettings.display.showZeroCountBadges) {
            if (!injectBadge(epicRow, cachedData.totalCount, true, epicKey)) {
              updateBadge(epicRow, cachedData.totalCount, true, epicKey);
            }
            injected++;
          }
        }

        // Handle timeline badges (shows per-sprint counts or total count)
        // Always update to handle timeframe changes
        if (currentSettings.display.showTimelineBadges) {
          if (cachedData.totalCount > 0 || currentSettings.display.showZeroCountBadges) {
            updateTimelineBadgesWithSprints(issueId, cachedData.sprintCounts, cachedData.totalCount, cachedData.unscheduledStories, cachedData.sprintAssignees);
            injected++;
          }
        }
      }
    } catch (error) {
      recordError('domParsing', String(error));
    }
  }

  // Update statistics
  const endTime = performance.now();
  const processingTime = endTime - startTime;

  statistics.processing.epicsProcessed = processed;
  statistics.processing.lastProcessingTimeMs = processingTime;
  statistics.processing.totalProcessingRuns++;

  // Track last 100 processing times for average
  processingTimes.push(processingTime);
  if (processingTimes.length > 100) {
    processingTimes.shift();
  }
  statistics.processing.averageProcessingTimeMs =
    processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;

  updateCacheStatistics();

  // Apply display settings to newly created badges
  applyDisplaySettings();

  // LAZY INITIALIZATION: Setup ResizeObserver after first successful badge injection
  // This ensures timeline bars exist in the DOM before we try to observe them
  if (!resizeObserverSetup && injected > 0) {
    resizeObserver = setupResizeObserver();
    if (resizeObserver) {
      resizeObserverSetup = true;
    }
  }

  if (currentSettings.debug.performanceProfiling) {
    console.log(`[Headcount] Processed ${processed} epics in ${processingTime.toFixed(2)}ms`);
  }

  return { processed, injected };
}

/**
 * Detect if we're in sprint view (grouped by team with sprint streams)
 * or roadmap view (top-level without sprint streams)
 */
function isSprintView(): boolean {
  const sprintStreams = document.querySelectorAll('[data-name*="sprint-stream-"]');
  return sprintStreams.length > 0;
}

/**
 * Update timeline badges with sprint-specific counts (sprint view)
 * or total count (roadmap view)
 */
function updateTimelineBadgesWithSprints(issueId: string, sprintCounts: Map<string, number>, totalCount: number, unscheduledStories?: string[], sprintAssignees?: Map<string, string[]>): void {
  // Find the timeline bar to get its position
  let timelineBar = document.querySelector(`[data-name="issue-bar-${issueId}"]`) as HTMLElement;

  // Fallback: if not found (e.g., issue-bar-undefined), try finding via parent in stream area
  // Note: [data-issue] exists in both left panel (scope-issue) and timeline area
  // We need the timeline area row, which does NOT have data-name^="scope-issue-"
  if (!timelineBar) {
    const allRows = document.querySelectorAll(`[data-issue="${issueId}"]`);
    for (const row of allRows) {
      const dataName = (row as HTMLElement).getAttribute('data-name');
      // Skip the epic row (has data-name="scope-issue-...")
      if (dataName && dataName.startsWith('scope-issue-')) {
        continue;
      }
      // This should be the timeline row
      timelineBar = row.querySelector('[data-name^="issue-bar-"]') as HTMLElement;
      if (timelineBar) {
        break;
      }
    }
  }

  if (!timelineBar) {
    return;
  }

  // Check if we're in sprint view or roadmap view
  const sprintViewEnabled = isSprintView();

  if (!sprintViewEnabled) {
    // ROADMAP VIEW: Show single badge with total count
    // Clear first to ensure clean state, then inject
    clearTimelineBadges(issueId);
    const totalAssignees = sprintAssignees ? Array.from(new Set([...sprintAssignees.values()].flat())).sort() : [];
    injectTimelineBadge(issueId, totalCount, totalAssignees);
    return;
  }

  // SPRINT VIEW: Check if sprint-specific badges toggle is enabled
  if (!currentSettings.display.showSprintSpecificBadges) {
    // Toggle OFF: Show single badge with total count (same as roadmap view)
    // BUT: Always show unscheduled warning badge regardless of toggle
    const noSprintCount = sprintCounts.get('__NO_SPRINT__') || 0;

    if (noSprintCount > 0 || (noSprintCount === 0 && currentSettings.display.showZeroCountBadges && sprintCounts.has('__NO_SPRINT__'))) {
      // Has unscheduled stories - show warning badge centered
      clearTimelineBadges(issueId);
      const assignees = sprintAssignees?.get('__NO_SPRINT__') || [];
      const sprintBadgeData = [{
        sprintName: '__NO_SPRINT__',
        count: noSprintCount,
        positionPercent: 50,
        assignees,
      }];
      injectSprintBadges(issueId, sprintBadgeData, unscheduledStories);
    } else {
      // No unscheduled stories - show regular single badge centered
      clearTimelineBadges(issueId);
      const totalAssignees = sprintAssignees ? Array.from(new Set([...sprintAssignees.values()].flat())).sort() : [];
      injectTimelineBadge(issueId, totalCount, totalAssignees);
    }
    return;
  }

  // SPRINT VIEW with toggle ON: Show per-sprint badges (existing logic)
  // Find the epic row to get team ID
  const epicRow = document.querySelector(`[data-issue="${issueId}"][data-name^="scope-issue-"]`) as HTMLElement;
  const teamGroup = epicRow?.getAttribute('data-group');

  // Extract team ID from data-group="team-61082"
  const teamId = teamGroup?.replace('team-', '') || '';

  // Get sprint layout for this team (cache it for performance)
  if (!sprintLayoutCache.has(teamId)) {
    const layout = getSprintLayout(teamId);
    sprintLayoutCache.set(teamId, layout);
  }

  const teamSprintLayout = sprintLayoutCache.get(teamId);
  if (!teamSprintLayout || teamSprintLayout.length === 0) {
    return;
  }

  // Parse bar position
  const leftMatch = timelineBar.style.left?.match(/([0-9.]+)%/);
  const rightMatch = timelineBar.style.right?.match(/([0-9.]+)%/);
  if (!leftMatch || !rightMatch) {
    return;
  }

  const barLeftPercent = parseFloat(leftMatch[1]);
  const barRightPercent = parseFloat(rightMatch[1]);

  // Find which sprints this bar overlaps (using team-specific sprint layout)
  const overlappingSprints = getOverlappingSprints(barLeftPercent, barRightPercent, teamSprintLayout);

  // Prepare badge data for each overlapping sprint
  const sprintBadgeData: Array<{ sprintName: string; count: number; positionPercent: number; assignees: string[] }> = [];

  // Check for stories not assigned to any sprint first
  const noSprintCount = sprintCounts.get('__NO_SPRINT__') || 0;
  const hasUnscheduled = noSprintCount > 0 || (noSprintCount === 0 && currentSettings.display.showZeroCountBadges && sprintCounts.has('__NO_SPRINT__'));

  for (const sprint of overlappingSprints) {
    // Find count for this sprint
    const count = sprintCounts.get(sprint.sprintName) || 0;

    // Skip sprints with 0 count unless showZeroCountBadges is enabled
    // ALSO skip zero counts if we have unscheduled stories (to avoid clutter)
    if (count === 0 && (!currentSettings.display.showZeroCountBadges || hasUnscheduled)) {
      continue;
    }

    // Calculate badge position within the bar using actual pixel positions
    const positionPercent = calculateBadgePosition(sprint, timelineBar);

    // Get assignee names for this sprint
    const assignees = sprintAssignees?.get(sprint.sprintName) || [];

    sprintBadgeData.push({
      sprintName: sprint.sprintName,
      count,
      positionPercent,
      assignees,
    });
  }

  // Add unscheduled badge if present
  if (hasUnscheduled) {
    // Get assignee names for unscheduled stories
    const assignees = sprintAssignees?.get('__NO_SPRINT__') || [];

    // Add special badge for unscheduled stories at 50% (center) of the bar
    sprintBadgeData.push({
      sprintName: '__NO_SPRINT__',
      count: noSprintCount,
      positionPercent: 50, // Center of the timeline bar
      assignees,
    });
  }

  // Inject all sprint badges
  if (sprintBadgeData.length > 0) {
    injectSprintBadges(issueId, sprintBadgeData, unscheduledStories);
  }
}

/**
 * Fetch accurate assignee count from Jira API directly
 * Content script has access to page cookies, so authentication works automatically
 * Results are cached to avoid spamming the API
 * Updates both the epic row badge and timeline bar badge
 *
 * COVERAGE NOTE: Excluded from coverage - Real Jira API integration with fetch().
 * Testing requires mocking complex HTTP requests, JSON parsing, error handling,
 * and retry logic. Better validated through integration tests against real/mock Jira API.
 */
/* istanbul ignore next */
async function fetchAccurateCount(epicRow: HTMLElement, epicKey: string, issueId: string): Promise<void> {
  // Mark as inflight to prevent duplicate requests
  if (inflightRequests.has(epicKey)) {
    return;
  }
  inflightRequests.add(epicKey);

  const apiStartTime = performance.now();

  try {
    statistics.processing.apiCallsMade++;

    // Dynamically detect Jira base URL from current page
    const JIRA_BASE_URL = `${window.location.protocol}//${window.location.host}`;
    const jql = `"Epic Link" = ${epicKey}`;
    // Request sprint field along with assignee
    // customfield_11002 is commonly used for sprints, but this may vary by Jira instance
    const maxResults = currentSettings.performance.apiMaxResults;
    const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=assignee,customfield_11002&maxResults=${maxResults}`;

    if (currentSettings.debug.logApiRequests) {
      console.log(`[Headcount] API request: ${epicKey}`);
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), currentSettings.performance.apiTimeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include', // Include cookies for authentication
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const issues = data.issues || [];

    // Extract unique assignee names (overall count)
    const uniqueAssignees = new Set<string>();

    // Group assignees by sprint
    const assigneesBySprint = new Map<string, Set<string>>();

    // Track assignees not assigned to any sprint
    const assigneesWithoutSprint = new Set<string>();
    const unscheduledStories: string[] = [];

    for (const issue of issues) {
      const assignee = issue.fields?.assignee;
      const assigneeName = assignee?.displayName;
      const issueKey = issue.key;

      if (assigneeName) {
        uniqueAssignees.add(assigneeName);
      }

      // Parse sprint data from customfield_11002
      const sprintData = issue.fields?.customfield_11002;

      if (assigneeName) {
        if (!sprintData || !Array.isArray(sprintData) || sprintData.length === 0) {
          // Story has assignee but NO sprint assignment
          assigneesWithoutSprint.add(assigneeName);
          if (issueKey) {
            unscheduledStories.push(issueKey);
          }
        } else {
          // Story has sprint assignments
          for (const sprintStr of sprintData) {
            const sprintName = parseSprintName(sprintStr);
            if (sprintName) {
              // Normalize sprint name to match DOM format
              const normalizedName = normalizeSprintName(sprintName);
              if (!assigneesBySprint.has(normalizedName)) {
                assigneesBySprint.set(normalizedName, new Set());
              }
              assigneesBySprint.get(normalizedName)!.add(assigneeName);
            }
          }
        }
      }
    }

    const count = uniqueAssignees.size;

    // Convert assignees by sprint to counts AND names
    const sprintCounts = new Map<string, number>();
    const sprintAssignees = new Map<string, string[]>();
    assigneesBySprint.forEach((assignees, sprint) => {
      sprintCounts.set(sprint, assignees.size);
      sprintAssignees.set(sprint, Array.from(assignees).sort());
    });

    // Add special entry for unscheduled stories ONLY if there are NO sprint assignments at all
    // If assigneesBySprint is empty, that means ALL stories are unscheduled → WARNING
    if (assigneesWithoutSprint.size > 0 && assigneesBySprint.size === 0) {
      sprintCounts.set('__NO_SPRINT__', assigneesWithoutSprint.size);
      sprintAssignees.set('__NO_SPRINT__', Array.from(assigneesWithoutSprint).sort());
    }

    // CRITICAL: Evict oldest entry if cache is full
    evictOldestCacheEntry();

    // CRITICAL: Cache the result with timestamp, unscheduled stories, and assignee names
    assigneeCountCache.set(epicKey, {
      totalCount: count,
      sprintCounts,
      timestamp: Date.now(), // CRITICAL: Add timestamp for TTL
      unscheduledStories: unscheduledStories.length > 0 ? unscheduledStories : undefined,
      sprintAssignees,
      totalAssignees: Array.from(uniqueAssignees).sort(),
    });

    statistics.cache.totalEntries = assigneeCountCache.size;

    // Inject left panel badge (next to epic key)
    if (currentSettings.display.showLeftPanelBadges) {
      if (count > 0 || currentSettings.display.showZeroCountBadges) {
        if (!injectBadge(epicRow, count, true, epicKey)) {
          updateBadge(epicRow, count, true, epicKey);
        }
        statistics.processing.badgesInjected++;
      }
    }

    // Update timeline badges with per-sprint counts
    if (currentSettings.display.showTimelineBadges) {
      if (count > 0 || currentSettings.display.showZeroCountBadges) {
        updateTimelineBadgesWithSprints(issueId, sprintCounts, count, unscheduledStories.length > 0 ? unscheduledStories : undefined, sprintAssignees);
        statistics.processing.badgesInjected++;
      }
    }

    const apiEndTime = performance.now();
    if (currentSettings.debug.logApiRequests) {
      console.log(`[Headcount] API request completed for ${epicKey} in ${(apiEndTime - apiStartTime).toFixed(2)}ms`);
    }
  } catch (error) {
    statistics.processing.apiCallsFailed++;

    // Cache error as 0 count to avoid retrying immediately
    // Common reasons: epic doesn't exist, no permission, network issues, rate limiting
    const errorMessage = `Failed to fetch ${epicKey}: ${String(error)}`;
    recordError('api', errorMessage);

    // CRITICAL: Still cache with timestamp to avoid retry storm
    evictOldestCacheEntry();
    assigneeCountCache.set(epicKey, {
      totalCount: 0,
      sprintCounts: new Map(),
      timestamp: Date.now(),
      sprintAssignees: new Map(),
      totalAssignees: [],
    });

    statistics.cache.totalEntries = assigneeCountCache.size;
  } finally {
    // Remove from inflight
    inflightRequests.delete(epicKey);
  }
}

/**
 * Setup ResizeObserver to watch for timeline layout changes
 *
 * When the filter panel is resized, timeline bars change width but badges remain
 * in stale positions. This observer detects those changes and triggers badge repositioning.
 *
 * Why watch timeline bars instead of parent containers?
 * - Sprint stream containers have width: 100% and don't trigger resize events
 * - Timeline bars (issue-bar-*) actually change pixel dimensions when viewport changes
 * - Watching 2 bars is sufficient since all bars resize together
 *
 * COVERAGE NOTE: Excluded from coverage - Browser ResizeObserver API.
 * Testing requires mocking ResizeObserver, getBoundingClientRect, and layout
 * calculations. Better validated through manual testing with window resizing.
 */
/* istanbul ignore next */
function setupResizeObserver(): ResizeObserver | null {
  try {
    let debounceTimeout: NodeJS.Timeout | null = null;
    const debounceMs = 300;

    const resizeObserver = new ResizeObserver(() => {
      // Debounce to avoid excessive updates during continuous resize
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        // Clear sprint layout cache - pixel positions are now stale
        sprintLayoutCache.clear();

        // Clear ALL timeline badges before recalculating
        const allTimelineBadges = document.querySelectorAll(`.${TIMELINE_BADGE_CLASS}`);
        allTimelineBadges.forEach(badge => badge.remove());

        // Reprocess epics to recalculate badge positions with fresh layout
        processEpics();

        debounceTimeout = null;
      }, debounceMs);
    });

    // Find timeline bars to observe
    const timelineBars = document.querySelectorAll('[data-name^="issue-bar-"]');

    if (timelineBars.length > 0) {
      // Observe first 2 bars - sufficient to detect resize since all bars resize together
      const barsToWatch = Math.min(2, timelineBars.length);
      for (let i = 0; i < barsToWatch; i++) {
        const bar = timelineBars[i];
        if (bar instanceof Element) {
          resizeObserver.observe(bar);
        }
      }
      return resizeObserver;
    }

    // No bars found - this shouldn't happen if called after badges are injected
    if (currentSettings.debug.enableDebugMode) {
      console.warn('[Headcount] ResizeObserver setup failed: no timeline bars found');
    }
    return null;
  } catch (error) {
    recordError('badgeInjection', `ResizeObserver setup failed: ${error}`);
    return null;
  }
}

/**
 * Setup MutationObserver to watch for DOM changes
 * Returns the observer instance for cleanup
 * @param debounceMs - Debounce delay in milliseconds (default 500, use 10 for tests)
 */
export function setupObserver(debounceMs: number = 500): MutationObserver {
  let debounceTimeout: NodeJS.Timeout | null = null;

  const observer = new MutationObserver((mutations) => {
    // Debounce processing to avoid excessive updates
    let shouldProcess = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // CRITICAL: Ignore badge insertions to prevent infinite re-rendering loop
        let isBadgeInsertion = true;
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // If any added node is NOT a badge, we should process
            if (!element.classList.contains(BADGE_CLASS) && !element.classList.contains(TIMELINE_BADGE_CLASS)) {
              isBadgeInsertion = false;
              break;
            }
          }
        }

        if (!isBadgeInsertion) {
          shouldProcess = true;
          break;
        }
      }
      if (mutation.type === 'attributes') {
        const target = mutation.target as HTMLElement;
        // CRITICAL: Ignore badge attribute changes
        if (target.classList.contains(BADGE_CLASS) || target.classList.contains(TIMELINE_BADGE_CLASS)) {
          continue;
        }
        // Watch for real Jira Plans attributes
        if (target.hasAttribute('data-issue') || target.hasAttribute('data-name')) {
          shouldProcess = true;
          break;
        }
      }
    }

    if (shouldProcess) {
      // Clear previous timeout
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      // Use setTimeout for debouncing
      debounceTimeout = setTimeout(() => {
        processEpics();
        debounceTimeout = null;
      }, debounceMs);
    }
  });

  // Observe the entire document for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-issue', 'data-name'],
  });

  return observer;
}

/**
 * Handle messages from popup and service worker
 */
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Handle PING from service worker (to detect if content script is already injected)
  if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'PING') {
    sendResponse({ success: true });
    return true;
  }

  if (!isPopupRequest(message)) {
    return false;
  }

  const request = message as PopupRequest;

  // Handle requests asynchronously
  (async () => {
    try {
      switch (request.type) {
        case 'GET_STATISTICS': {
          updateCacheStatistics();
          sendResponse({
            type: 'GET_STATISTICS_RESPONSE',
            success: true,
            statistics,
          } as PopupResponse);
          break;
        }

        case 'CLEAR_CACHE': {
          if (request.epicKey) {
            // Clear specific epic
            const existed = assigneeCountCache.has(request.epicKey);
            assigneeCountCache.delete(request.epicKey);
            statistics.cache.totalEntries = assigneeCountCache.size;
            statistics.cache.lastClearTimestamp = Date.now();

            sendResponse({
              type: 'CLEAR_CACHE_RESPONSE',
              success: true,
              clearedCount: existed ? 1 : 0,
            } as PopupResponse);
          } else {
            // Clear all cache
            const count = assigneeCountCache.size;
            assigneeCountCache.clear();

            // Clear all badges from DOM
            clearAllBadges();

            statistics.cache.totalEntries = 0;
            statistics.cache.lastClearTimestamp = Date.now();

            sendResponse({
              type: 'CLEAR_CACHE_RESPONSE',
              success: true,
              clearedCount: count,
            } as PopupResponse);
          }

          // Trigger re-processing
          setTimeout(() => processEpics(), 100);
          break;
        }

        case 'REFRESH_CACHE': {
          // Clear all cache and force refresh
          assigneeCountCache.clear();

          // Clear all badges from DOM
          clearAllBadges();

          statistics.cache.totalEntries = 0;

          // Trigger immediate re-processing
          const result = processEpics();

          sendResponse({
            type: 'REFRESH_CACHE_RESPONSE',
            success: true,
            refreshedCount: result.processed,
          } as PopupResponse);
          break;
        }

        default:
          sendResponse({
            type: 'ERROR',
            success: false,
            error: `Unknown request type: ${(request as { type?: string }).type}`,
          } as PopupResponse);
      }
    } catch (error) {
      sendResponse({
        type: 'ERROR',
        success: false,
        error: String(error),
      } as PopupResponse);
    }
  })();

  // Return true to indicate async response
  return true;
});

/**
 * Listen for settings changes from storage
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[SETTINGS_STORAGE_KEY]) {
    const newSettings = changes[SETTINGS_STORAGE_KEY].newValue as Partial<ExtensionSettings>;
    currentSettings = mergeWithDefaults(newSettings);

    if (currentSettings.debug.enableDebugMode) {
      console.log('[Headcount] Settings updated:', currentSettings);
    }

    // Apply display settings immediately to existing badges
    applyDisplaySettings();

    // Re-process epics to apply other settings (performance, filters, etc.)
    processEpics();
  }
});

/**
 * Main initialization function
 */
export async function initialize() {
  // Load settings first
  await loadSettings();

  // Initial processing of epics on page load
  const result = processEpics();

  if (currentSettings.debug.enableDebugMode) {
    console.log('[Headcount] Initialized:', result);
  }

  // Setup observers for dynamic updates
  const mutationObserver = setupObserver(currentSettings.performance.debounceDelayMs);
  // NOTE: ResizeObserver is set up lazily in processEpics() after first badges are injected

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    mutationObserver.disconnect();
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });

  return mutationObserver;
}

// Auto-initialize only if not in test environment
if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize().catch(error => {
        console.error('[Headcount] Initialization failed:', error);
      });
    });
  } else {
    initialize().catch(error => {
      console.error('[Headcount] Initialization failed:', error);
    });
  }
}

/**
 * Test helper: Populate cache with assignee data for testing
 * This allows tests to simulate cached data and test badge injection
 */
export function __test_populateCache__(epicKey: string, totalCount: number, assignees: string[] = []): void {
  assigneeCountCache.set(epicKey, {
    totalCount,
    sprintCounts: new Map(),
    timestamp: Date.now(),
    sprintAssignees: new Map(),
    totalAssignees: assignees,
  });
  statistics.cache.totalEntries = assigneeCountCache.size;
}

/**
 * Test helper: Clear all caches for testing
 */
export function __test_clearCache__(): void {
  assigneeCountCache.clear();
  inflightRequests.clear();
  sprintLayoutCache.clear();
  statistics.cache.totalEntries = 0;
  statistics.cache.hitCount = 0;
  statistics.cache.missCount = 0;
}
