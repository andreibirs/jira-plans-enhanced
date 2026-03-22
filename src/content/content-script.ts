/**
 * Content Script for Jira Plans Enhanced
 *
 * Simplified DOM-only approach:
 * - Monitor Jira Plans page for epic elements (MutationObserver)
 * - Extract assignee data from visible DOM
 * - Inject badge UI adjacent to epic titles
 * - Update badges when epics expand/collapse
 */

import { findEpicRows, findStoryRows, extractEpicData } from './dom-parser';
import { injectSprintBadges, injectTimelineBadge, injectBadge, updateBadge, countBadges, clearAllBadges, clearTimelineBadges, clearAllStoryAvatars, injectStoryAvatar, injectStoryPwBadge, BADGE_CLASS, TIMELINE_BADGE_CLASS, STORY_AVATAR_CLASS } from './badge';
import { getSprintLayout, getOverlappingSprints, calculateBadgePosition, SprintSegment, normalizeSprintName } from './sprint-layout';
import { ExtensionSettings, DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, mergeWithDefaults } from '../shared/settings';
import { ExtensionStatistics, INITIAL_STATISTICS, calculateHitRate } from '../shared/statistics';
import { PopupRequest, PopupResponse, isPopupRequest } from '../shared/messages';
import { AssigneeInfo } from '../shared/types';

export interface ProcessResult {
  processed: number;
  injected: number;
}

// Effort per person per sprint — tracks SP and PD separately for correct threshold application
interface PersonEffort {
  sp: number;
  pd: number;
}

// Cache for API results — keyed by epicKey (e.g., "PROJ-123")
interface CachedAssigneeData {
  totalCount: number;
  sprintCounts: Map<string, number>;
  timestamp: number;
  unscheduledStories?: string[];
  sprintAssignees: Map<string, AssigneeInfo[]>;
  totalAssignees: AssigneeInfo[];
  effortPerPersonPerSprint: Map<string, Map<string, PersonEffort>>;       // last sprint → (userId → effort)
  effortPerPersonCurrentSprints: Map<string, Map<string, PersonEffort>>;  // ACTIVE/FUTURE → (userId → effort)
  estimatedStoryCount: number;
  totalStoryCount: number;
  epicEstimate?: { sp: number | null; pd: number | null }; // Epic's own SP/days for direct PW
}
const assigneeCountCache = new Map<string, CachedAssigneeData>();

// Track which epics we're currently fetching to avoid duplicate requests
const inflightRequests = new Set<string>();

// Cache sprint layouts per team (key: teamId, value: sprint segments)
const sprintLayoutCache = new Map<string, SprintSegment[]>();

// Cache story-level assignee data (key: story issueId, value: AssigneeInfo)
// Populated during epic API fetches, consumed by processStories()
const storyAssigneeCache = new Map<string, AssigneeInfo>();

// Per-story PW detail — references into epic cache for dynamic threshold recomputation
interface StoryPwDetail {
  effort: number;           // SP value or person-days
  effortUnit: 'sp' | 'pd'; // Which field the effort came from
  userId: string;
  epicKey: string;
  lastSprint: string;
  currentSprint: string;
}
const storyPwDetailCache = new Map<string, StoryPwDetail | null>();

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

  // Story-level details — hidden if timeline badges are off (stories live on the timeline)
  const showStoryDetails = currentSettings.display.showTimelineBadges && currentSettings.display.showStoryAvatars;
  const storyAvatars = document.querySelectorAll(`.${STORY_AVATAR_CLASS}`);
  storyAvatars.forEach((avatar: Element) => {
    (avatar as HTMLElement).style.display = showStoryDetails ? 'flex' : 'none';
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
 * Build display override for PW mode badges
 * Shows "X PW" when remaining == total, or "X PW left (Y total)" otherwise
 */
function buildPwOverride(cachedData: CachedAssigneeData): { text: string; tooltip: string } | undefined {
  if (currentSettings.appearance.badgeDisplayMode !== 'personweeks') return undefined;

  const { total, remaining, epicLevel } = computePersonWeeks(cachedData);

  if (epicLevel) {
    // Epic-level PW: show direct estimate with source indicator
    const est = cachedData.epicEstimate!;
    const source = (est.sp && est.sp > 0) ? `${est.sp} SP` : `${est.pd} days`;
    const text = `${total} PW`;
    const tooltip = `${total} person-weeks (epic estimate: ${source})`;
    return { text, tooltip };
  }

  const { estimatedStoryCount, totalStoryCount, totalCount } = cachedData;
  const allEstimated = estimatedStoryCount >= totalStoryCount;
  const estimationNote = allEstimated ? '' : `, ${estimatedStoryCount}/${totalStoryCount}`;

  let text: string;
  if (remaining === total) {
    // No completed sprints — just show total
    text = `${total} PW${estimationNote ? ` (${estimatedStoryCount}/${totalStoryCount})` : ''}`;
  } else {
    text = `${remaining} PW left (${total} total${estimationNote})`;
  }

  const tooltip = `${remaining} person-weeks remaining, ${total} total (${totalCount} engineers, ${totalStoryCount} stories${allEstimated ? '' : `, ${estimatedStoryCount} estimated`})`;
  return { text, tooltip };
}

/**
 * Convert effort to person-weeks using the appropriate threshold
 * SP uses spThresholdPerPw, person-days uses pdThresholdPerPw
 * ≤threshold = 1 PW, >threshold = 2 PW, no effort = 0 PW
 */
function effortToPersonWeeks(effort: number | null | undefined, unit: 'sp' | 'pd' = 'sp'): number {
  if (!effort || effort <= 0) return 0;
  const threshold = unit === 'pd'
    ? currentSettings.appearance.pdThresholdPerPw
    : currentSettings.appearance.spThresholdPerPw;
  return effort <= threshold ? 1 : 2;
}

/**
 * Convert a PersonEffort to PW — uses whichever field is populated (SP preferred over PD)
 * A person can only contribute max 2 PW per sprint regardless of mixed sources
 */
function personEffortToPw(effort: PersonEffort): number {
  const spPw = effortToPersonWeeks(effort.sp, 'sp');
  const pdPw = effortToPersonWeeks(effort.pd, 'pd');
  return Math.min(Math.max(spPw, pdPw), 2);
}

/**
 * Compute person-weeks from cached per-person-per-sprint effort data
 * Returns total PW (all sprints) and remaining PW (active/future only)
 * Uses current threshold settings so changes are reflected immediately
 */
function computePersonWeeks(cachedData: CachedAssigneeData): { total: number; remaining: number; epicLevel: boolean } {
  // Epic-level PW: epic's own SP/days used as PW (1 SP = 1 PW, 5 days = 1 PW)
  const src = currentSettings.appearance.pwSource;
  if (src !== 'stories' && cachedData.epicEstimate) {
    // 'epic' = always use epic estimate; 'epic-fallback' = use epic if present, else fall through to stories
    const epicPw = (cachedData.epicEstimate.sp && cachedData.epicEstimate.sp > 0)
      ? Math.ceil(cachedData.epicEstimate.sp)
      : Math.ceil((cachedData.epicEstimate.pd || 0) / 5);
    return { total: epicPw, remaining: epicPw, epicLevel: true };
  }
  if (src === 'epic' && !cachedData.epicEstimate) {
    // Epic mode but no estimate on the epic — show 0
    return { total: 0, remaining: 0, epicLevel: true };
  }

  // Story-level PW: aggregate per-person-per-sprint effort
  let total = 0;
  for (const effortPerPerson of cachedData.effortPerPersonPerSprint.values()) {
    for (const effort of effortPerPerson.values()) {
      total += personEffortToPw(effort);
    }
  }
  let remaining = 0;
  for (const effortPerPerson of cachedData.effortPerPersonCurrentSprints.values()) {
    for (const effort of effortPerPerson.values()) {
      remaining += personEffortToPw(effort);
    }
  }
  return { total, remaining, epicLevel: false };
}

/**
 * Parse sprint name and state from Jira's sprint field format
 * Format: "com.atlassian.greenhopper.service.sprint.Sprint@hash[id=209802,rapidViewId=45164,state=ACTIVE,name=Sprint 45,...]"
 */
function parseSprint(sprintStr: string): { name: string; state: string } | null {
  if (typeof sprintStr !== 'string') {
    return null;
  }

  const nameMatch = sprintStr.match(/name=([^,\]]+)/);
  const stateMatch = sprintStr.match(/state=([^,\]]+)/);
  if (nameMatch && nameMatch[1]) {
    return {
      name: nameMatch[1].trim(),
      state: stateMatch ? stateMatch[1].trim() : 'UNKNOWN',
    };
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
            const pwOverride = buildPwOverride(cachedData);
            if (!injectBadge(epicRow, cachedData.totalCount, true, epicKey, pwOverride)) {
              updateBadge(epicRow, cachedData.totalCount, true, epicKey, pwOverride);
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

  // Process story rows for assignee avatars
  processStories();

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
 * Process visible story rows and inject assignee avatars on their timeline bars
 *
 * Stories are child issues under epics. When we fetch epic data from the API,
 * we also get each story's assignee. This function finds story rows in the DOM
 * and overlays the assignee's avatar on the story's timeline bar.
 */
function processStories(): void {
  if (!currentSettings.display.showStoryAvatars) {
    return;
  }

  const isPwMode = currentSettings.appearance.badgeDisplayMode === 'personweeks';

  const storyRows = findStoryRows();

  for (const storyRow of storyRows) {
    const issueId = storyRow.getAttribute('data-issue');
    if (!issueId) continue;

    if (isPwMode) {
      // PW mode: show SP + person's PW on each story
      const detail = storyPwDetailCache.get(issueId);
      if (detail !== undefined) {
        if (detail === null) {
          injectStoryPwBadge(issueId, null);
        } else {
          // Compute person's PW dynamically using current threshold and per-sprint effort (last sprint)
          const cachedEpic = assigneeCountCache.get(detail.epicKey);
          const personEffort = cachedEpic?.effortPerPersonPerSprint?.get(detail.lastSprint)?.get(detail.userId);
          const personPw = personEffort ? personEffortToPw(personEffort) : 0;
          injectStoryPwBadge(issueId, { effort: detail.effort, effortUnit: detail.effortUnit, personPw });
        }
      }
    } else {
      // Avatar mode: show assignee avatar
      const assignee = storyAssigneeCache.get(issueId);
      if (!assignee) continue;
      injectStoryAvatar(issueId, assignee);
    }
  }
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
function updateTimelineBadgesWithSprints(issueId: string, sprintCounts: Map<string, number>, totalCount: number, unscheduledStories?: string[], sprintAssignees?: Map<string, AssigneeInfo[]>): void {
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

  // Person-weeks mode: show single PW badge regardless of view mode
  if (currentSettings.appearance.badgeDisplayMode === 'personweeks') {
    // Look up cached data to compute PW dynamically with current threshold
    const epicRow = document.querySelector(`[data-issue="${issueId}"][data-name^="scope-issue-"]`) as HTMLElement;
    const epicKeyLink = epicRow?.querySelector('a[href*="/browse/"]');
    const cachedEpicKey = epicKeyLink?.textContent?.trim();
    const cachedData = cachedEpicKey ? assigneeCountCache.get(cachedEpicKey) : null;
    if (!cachedData) return;

    clearTimelineBadges(issueId);
    const { total, remaining, epicLevel } = computePersonWeeks(cachedData);

    let badgeText: string;
    let badgeTooltip: string;
    if (epicLevel) {
      const est = cachedData.epicEstimate!;
      const source = (est.sp && est.sp > 0) ? `${est.sp} SP` : `${est.pd} days`;
      badgeText = `${total} PW`;
      badgeTooltip = `${total} person-weeks (epic estimate: ${source})`;
    } else {
      const allEstimated = cachedData.estimatedStoryCount >= cachedData.totalStoryCount;
      const estimationNote = allEstimated ? '' : `, ${cachedData.estimatedStoryCount}/${cachedData.totalStoryCount}`;
      if (remaining === total) {
        badgeText = `${total} PW${estimationNote ? ` (${cachedData.estimatedStoryCount}/${cachedData.totalStoryCount})` : ''}`;
      } else {
        badgeText = `${remaining} PW left (${total} total${estimationNote})`;
      }
      badgeTooltip = `${remaining} person-weeks remaining, ${total} total (${totalCount} engineers, ${cachedData.totalStoryCount} stories${allEstimated ? '' : `, ${cachedData.estimatedStoryCount} estimated`})`;
    }

    const badge = document.createElement('span');
    badge.className = TIMELINE_BADGE_CLASS;
    badge.textContent = badgeText;
    badge.title = badgeTooltip;
    const fontSize = badgeText.length <= 4 ? '10px' : badgeText.length <= 10 ? '9px' : '8px';
    badge.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      padding: 2px 6px;
      background-color: rgba(100, 50, 150, 0.75);
      border-radius: 3px;
      font-size: ${fontSize};
      font-weight: bold;
      color: #fff;
      display: inline-block;
      pointer-events: auto;
      z-index: 2;
      min-width: 18px;
      max-width: 90%;
      cursor: help;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    const computedPosition = window.getComputedStyle(timelineBar).position;
    if (computedPosition === 'static') {
      timelineBar.style.position = 'relative';
    }
    timelineBar.appendChild(badge);
    return;
  }

  // Check if we're in sprint view or roadmap view
  const sprintViewEnabled = isSprintView();

  if (!sprintViewEnabled) {
    // ROADMAP VIEW: Show single badge with total count
    // Clear first to ensure clean state, then inject
    clearTimelineBadges(issueId);
    // Deduplicate assignees across all sprints by accountId
    const uniqueAssigneeMap = new Map<string, AssigneeInfo>();
    if (sprintAssignees) {
      for (const assignees of sprintAssignees.values()) {
        for (const assignee of assignees) {
          uniqueAssigneeMap.set(assignee.accountId, assignee);
        }
      }
    }
    const totalAssignees = Array.from(uniqueAssigneeMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
    const displayMode = currentSettings.appearance.badgeDisplayMode || 'count';
    const avatarOptions = {
      maxVisible: currentSettings.appearance.maxVisibleAvatars || 4,
    };
    injectTimelineBadge(issueId, totalCount, totalAssignees, displayMode, avatarOptions);
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
      const displayMode = currentSettings.appearance.badgeDisplayMode || 'count';
      const avatarOptions = {
        maxVisible: currentSettings.appearance.maxVisibleAvatars || 4,
      };
      injectSprintBadges(issueId, sprintBadgeData, unscheduledStories, displayMode, avatarOptions);
    } else {
      // No unscheduled stories - show regular single badge centered
      clearTimelineBadges(issueId);
      // Deduplicate assignees across all sprints by accountId
      const uniqueAssigneeMap = new Map<string, AssigneeInfo>();
      if (sprintAssignees) {
        for (const assignees of sprintAssignees.values()) {
          for (const assignee of assignees) {
            uniqueAssigneeMap.set(assignee.accountId, assignee);
          }
        }
      }
      const totalAssignees = Array.from(uniqueAssigneeMap.values()).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
      const displayMode = currentSettings.appearance.badgeDisplayMode;
      const avatarOptions = {
        maxVisible: currentSettings.appearance.maxVisibleAvatars,
      };
      injectTimelineBadge(issueId, totalCount, totalAssignees, displayMode, avatarOptions);
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
  const sprintBadgeData: Array<{ sprintName: string; count: number; positionPercent: number; assignees: AssigneeInfo[] }> = [];

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
    const displayMode = currentSettings.appearance.badgeDisplayMode || 'count';
    const avatarOptions = {
      maxVisible: currentSettings.appearance.maxVisibleAvatars || 4,
    };
    injectSprintBadges(issueId, sprintBadgeData, unscheduledStories, displayMode, avatarOptions);
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
    const jql = `"Epic Link" = ${epicKey} OR key = ${epicKey}`;
    // Request sprint field along with assignee
    // customfield_11002 is commonly used for sprints, but this may vary by Jira instance
    const maxResults = currentSettings.performance.apiMaxResults;
    const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=assignee,customfield_11002,customfield_10003,timeestimate,issuetype&maxResults=${maxResults}`;

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
    const allIssues = data.issues || [];

    // Separate the epic itself from its child stories
    let epicEstimate: { sp: number | null; pd: number | null } | undefined;
    const issues = allIssues.filter((issue: { key: string; fields?: { issuetype?: { name?: string }; customfield_10003?: number | null; timeestimate?: number | null } }) => {
      if (issue.key === epicKey) {
        // Extract epic's own estimates for epic-level PW
        const epicSp = issue.fields?.customfield_10003 as number | null;
        const epicTimeSec = issue.fields?.timeestimate as number | null;
        const epicPd = epicTimeSec ? epicTimeSec / 28800 : null;
        if ((epicSp && epicSp > 0) || (epicPd && epicPd > 0)) {
          epicEstimate = { sp: epicSp, pd: epicPd };
        }
        return false; // exclude epic from child story processing
      }
      return true;
    });

    // Extract unique assignee info (overall count) - keyed by accountId
    const uniqueAssignees = new Map<string, AssigneeInfo>();
    let estimatedStoryCount = 0;
    const totalStoryCount = issues.length;

    // Effort per person per sprint — two maps for total vs remaining PW
    const effortPerPersonPerSprint = new Map<string, Map<string, PersonEffort>>();
    const effortPerPersonCurrentSprints = new Map<string, Map<string, PersonEffort>>();

    // Group assignees by sprint
    const assigneesBySprint = new Map<string, Map<string, AssigneeInfo>>();

    // Track assignees not assigned to any sprint
    const assigneesWithoutSprint = new Map<string, AssigneeInfo>();
    const unscheduledStories: string[] = [];

    // Track story details for second pass (to set person's PW after totals are known)
    const storyDetails: Array<{ issueId: string; effort: number; effortUnit: 'sp' | 'pd'; userId: string | undefined; lastSprint: string; currentSprint: string }> = [];

    for (const issue of issues) {
      const assignee = issue.fields?.assignee;
      const issueKey = issue.key;
      const storyIssueId = issue.id; // Numeric ID matching data-issue in DOM
      const storyPoints = issue.fields?.customfield_10003 as number | null;
      const timeEstimateSec = issue.fields?.timeestimate as number | null;
      const timeEstimateDays = timeEstimateSec ? timeEstimateSec / 28800 : null; // 8h = 28800s

      // Determine effort: prefer SP, fall back to time estimate in person-days
      const hasEffort = (storyPoints && storyPoints > 0) || (timeEstimateDays && timeEstimateDays > 0);
      const effort = (storyPoints && storyPoints > 0) ? storyPoints : (timeEstimateDays || 0);
      const effortUnit: 'sp' | 'pd' = (storyPoints && storyPoints > 0) ? 'sp' : 'pd';

      if (storyIssueId) {
        if (hasEffort) {
          estimatedStoryCount++;
        }
      }

      // Support both Jira Cloud (accountId) and Jira Server/Data Center (name/key)
      const userId = assignee?.accountId || assignee?.name || assignee?.key;

      // Parse sprint data: storySprints (all) for badge placement, currentSprints (ACTIVE/FUTURE) for remaining PW
      const sprintData = issue.fields?.customfield_11002;
      const storySprints: string[] = [];
      const currentSprints: string[] = [];
      if (sprintData && Array.isArray(sprintData)) {
        for (const sprintStr of sprintData) {
          const sprint = parseSprint(sprintStr);
          if (sprint) {
            const normalized = normalizeSprintName(sprint.name);
            storySprints.push(normalized);
            if (sprint.state === 'ACTIVE' || sprint.state === 'FUTURE') {
              currentSprints.push(normalized);
            }
          }
        }
      }

      if (storyIssueId) {
        const lastSprint = storySprints.length > 0 ? storySprints[storySprints.length - 1] : '__UNSCHEDULED__';
        const currentSprint = currentSprints.length > 0 ? currentSprints[0] : '__UNSCHEDULED__';
        storyDetails.push({ issueId: String(storyIssueId), effort, effortUnit, userId, lastSprint, currentSprint });
      }

      if (assignee && userId) {
        // Extract assignee info
        const assigneeInfo: AssigneeInfo = {
          accountId: userId, // Use accountId, name, or key as identifier
          displayName: assignee.displayName || 'Unknown',
          avatarUrls: {
            '16x16': assignee.avatarUrls?.['16x16'] || '',
            '24x24': assignee.avatarUrls?.['24x24'] || '',
            '32x32': assignee.avatarUrls?.['32x32'] || '',
            '48x48': assignee.avatarUrls?.['48x48'] || '',
          },
          emailAddress: assignee.emailAddress,
        };

        uniqueAssignees.set(userId, assigneeInfo);

        // Accumulate effort per person per sprint for PW calculation
        if (hasEffort) {
          const lastSprint = storySprints.length > 0 ? storySprints[storySprints.length - 1] : '__UNSCHEDULED__';
          if (!effortPerPersonPerSprint.has(lastSprint)) {
            effortPerPersonPerSprint.set(lastSprint, new Map());
          }
          const allMap = effortPerPersonPerSprint.get(lastSprint)!;
          const existing = allMap.get(userId) || { sp: 0, pd: 0 };
          existing[effortUnit] += effort;
          allMap.set(userId, existing);

          // ACTIVE/FUTURE only (remaining work)
          if (currentSprints.length > 0) {
            const activeSprint = currentSprints[0];
            if (!effortPerPersonCurrentSprints.has(activeSprint)) {
              effortPerPersonCurrentSprints.set(activeSprint, new Map());
            }
            const currentMap = effortPerPersonCurrentSprints.get(activeSprint)!;
            const existingCurrent = currentMap.get(userId) || { sp: 0, pd: 0 };
            existingCurrent[effortUnit] += effort;
            currentMap.set(userId, existingCurrent);
          }
        }

        // Cache story-level assignee for story avatar display
        if (storyIssueId) {
          storyAssigneeCache.set(String(storyIssueId), assigneeInfo);
        }

        if (storySprints.length === 0) {
          // Story has assignee but NO sprint assignment
          assigneesWithoutSprint.set(userId, assigneeInfo);
          if (issueKey) {
            unscheduledStories.push(issueKey);
          }
        } else {
          // Story has sprint assignments
          for (const normalizedName of storySprints) {
            if (!assigneesBySprint.has(normalizedName)) {
              assigneesBySprint.set(normalizedName, new Map());
            }
            assigneesBySprint.get(normalizedName)!.set(userId, assigneeInfo);
          }
        }
      }
    }

    // Populate story-level PW detail cache for dynamic threshold recomputation
    for (const detail of storyDetails) {
      if (detail.effort > 0 && detail.userId) {
        storyPwDetailCache.set(detail.issueId, {
          effort: detail.effort,
          effortUnit: detail.effortUnit,
          userId: detail.userId,
          epicKey,
          lastSprint: detail.lastSprint,
          currentSprint: detail.currentSprint,
        });
      } else {
        storyPwDetailCache.set(detail.issueId, null);
      }
    }

    const count = uniqueAssignees.size;

    // Convert assignees by sprint to counts AND full assignee info
    const sprintCounts = new Map<string, number>();
    const sprintAssignees = new Map<string, AssigneeInfo[]>();
    assigneesBySprint.forEach((assignees, sprint) => {
      sprintCounts.set(sprint, assignees.size);
      sprintAssignees.set(sprint, Array.from(assignees.values()).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ));
    });

    // Add special entry for unscheduled stories ONLY if there are NO sprint assignments at all
    // If assigneesBySprint is empty, that means ALL stories are unscheduled → WARNING
    if (assigneesWithoutSprint.size > 0 && assigneesBySprint.size === 0) {
      sprintCounts.set('__NO_SPRINT__', assigneesWithoutSprint.size);
      sprintAssignees.set('__NO_SPRINT__', Array.from(assigneesWithoutSprint.values()).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ));
    }

    evictOldestCacheEntry();
    assigneeCountCache.set(epicKey, {
      totalCount: count,
      sprintCounts,
      timestamp: Date.now(),
      unscheduledStories: unscheduledStories.length > 0 ? unscheduledStories : undefined,
      sprintAssignees,
      totalAssignees: Array.from(uniqueAssignees.values()).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
      effortPerPersonPerSprint,
      effortPerPersonCurrentSprints,
      estimatedStoryCount,
      totalStoryCount,
      epicEstimate,
    });

    statistics.cache.totalEntries = assigneeCountCache.size;

    // Inject left panel badge (next to epic key)
    if (currentSettings.display.showLeftPanelBadges) {
      if (count > 0 || currentSettings.display.showZeroCountBadges) {
        const pwOverride = buildPwOverride(assigneeCountCache.get(epicKey)!);
        if (!injectBadge(epicRow, count, true, epicKey, pwOverride)) {
          updateBadge(epicRow, count, true, epicKey, pwOverride);
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

    // Process story avatars now that we have fresh data
    processStories();

    const apiEndTime = performance.now();
    if (currentSettings.debug.logApiRequests) {
      console.log(`[Headcount] API request completed for ${epicKey} in ${(apiEndTime - apiStartTime).toFixed(2)}ms`);
    }
  } catch (error) {
    statistics.processing.apiCallsFailed++;

    const errorMessage = `Failed to fetch ${epicKey}: ${String(error)}`;
    recordError('api', errorMessage);

    // Cache as 0 to avoid retry storm
    evictOldestCacheEntry();
    assigneeCountCache.set(epicKey, {
      totalCount: 0,
      sprintCounts: new Map(),
      timestamp: Date.now(),
      sprintAssignees: new Map(),
      totalAssignees: [],
      effortPerPersonPerSprint: new Map(),
      effortPerPersonCurrentSprints: new Map(),
      estimatedStoryCount: 0,
      totalStoryCount: 0,
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
            if (!element.classList.contains(BADGE_CLASS) && !element.classList.contains(TIMELINE_BADGE_CLASS) && !element.classList.contains(STORY_AVATAR_CLASS)) {
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
        if (target.classList.contains(BADGE_CLASS) || target.classList.contains(TIMELINE_BADGE_CLASS) || target.classList.contains(STORY_AVATAR_CLASS)) {
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
    const oldSettings = changes[SETTINGS_STORAGE_KEY].oldValue as Partial<ExtensionSettings> | undefined;
    const newSettings = changes[SETTINGS_STORAGE_KEY].newValue as Partial<ExtensionSettings>;
    currentSettings = mergeWithDefaults(newSettings);

    if (currentSettings.debug.enableDebugMode) {
      console.log('[Headcount] Settings updated:', currentSettings);
    }

    const oldDisplayMode = oldSettings?.appearance?.badgeDisplayMode;
    const newDisplayMode = newSettings.appearance?.badgeDisplayMode;
    const thresholdChanged =
      oldSettings?.appearance?.spThresholdPerPw !== newSettings.appearance?.spThresholdPerPw ||
      oldSettings?.appearance?.pdThresholdPerPw !== newSettings.appearance?.pdThresholdPerPw;
    const epicPwSettingChanged =
      oldSettings?.appearance?.pwSource !== newSettings.appearance?.pwSource;

    if (oldDisplayMode && newDisplayMode && oldDisplayMode !== newDisplayMode) {
      // Display mode changed - clear everything and re-inject
      clearAllBadges();
      processEpics();
    } else if (thresholdChanged || epicPwSettingChanged) {
      // Threshold or epic PW settings changed - clear story badges so they re-inject with new PW values
      clearAllStoryAvatars();
      applyDisplaySettings();
      processEpics();
    } else {
      applyDisplaySettings();
      processEpics();
    }
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
export function __test_populateCache__(epicKey: string, totalCount: number, assignees: AssigneeInfo[] = []): void {
  assigneeCountCache.set(epicKey, {
    totalCount,
    sprintCounts: new Map(),
    timestamp: Date.now(),
    sprintAssignees: new Map(),
    totalAssignees: assignees,
    effortPerPersonPerSprint: new Map(),
    effortPerPersonCurrentSprints: new Map(),
    estimatedStoryCount: 0,
    totalStoryCount: 0,
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
  storyAssigneeCache.clear();
  storyPwDetailCache.clear();
  statistics.cache.totalEntries = 0;
  statistics.cache.hitCount = 0;
  statistics.cache.missCount = 0;
}
