/**
 * Cache module for Jira Plans Enhanced
 *
 * Provides caching infrastructure for epic assignee data, sprint layouts,
 * story assignees, and per-story PW details.
 */

import { AssigneeInfo } from '../shared/types';
import { SprintSegment } from './sprint-layout';

// Effort per person per sprint -- tracks SP and PD separately for correct threshold application
export interface PersonEffort {
  sp: number;
  pd: number;
}

// Cache for API results -- keyed by epicKey (e.g., "PROJ-123")
export interface CachedAssigneeData {
  totalCount: number;
  sprintCounts: Map<string, number>;
  timestamp: number;
  isError?: boolean;
  unscheduledStories?: string[];
  sprintAssignees: Map<string, AssigneeInfo[]>;
  totalAssignees: AssigneeInfo[];
  effortPerPersonPerSprint: Map<string, Map<string, PersonEffort>>;       // last sprint -> (userId -> effort)
  effortPerPersonCurrentSprints: Map<string, Map<string, PersonEffort>>;  // ACTIVE/FUTURE -> (userId -> effort)
  estimatedStoryCount: number;
  totalStoryCount: number;
  epicEstimate?: { sp: number | null; pd: number | null }; // Epic's own SP/days for direct PW
}

// Per-story PW detail -- references into epic cache for dynamic threshold recomputation
export interface StoryPwDetail {
  effort: number;           // SP value or person-days
  effortUnit: 'sp' | 'pd'; // Which field the effort came from
  userId: string;
  epicKey: string;
  lastSprint: string;
  currentSprint: string;
}

/** Error cache entries expire after 30 seconds (much shorter than normal 5-min TTL) */
export const ERROR_CACHE_TTL_MS = 30000;

/**
 * Encapsulates all cache Maps and Sets for the extension.
 * Supports dependency injection for testing and SPA navigation resets.
 */
export class CacheStore {
  readonly assigneeCount = new Map<string, CachedAssigneeData>();
  readonly inflight = new Set<string>();
  readonly sprintLayout = new Map<string, SprintSegment[]>();
  readonly storyAssignee = new Map<string, AssigneeInfo>();
  readonly storyPwDetail = new Map<string, StoryPwDetail | null>();

  /** Populate cache entry (used by both production code and tests) */
  populate(epicKey: string, totalCount: number, assignees: AssigneeInfo[] = []): void {
    this.assigneeCount.set(epicKey, {
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
  }

  /** Clear all caches */
  clear(): void {
    this.assigneeCount.clear();
    this.inflight.clear();
    this.sprintLayout.clear();
    this.storyAssignee.clear();
    this.storyPwDetail.clear();
  }

  /** Check if cache entry is expired */
  isExpired(epicKey: string, cacheTtlMs: number): boolean {
    const cached = this.assigneeCount.get(epicKey);
    if (!cached) return true;
    const ttl = cached.isError ? ERROR_CACHE_TTL_MS : cacheTtlMs;
    const age = Date.now() - cached.timestamp;
    return age > ttl;
  }

  /** Evict oldest entry if over max size. Returns evicted key or null. */
  evictOldest(maxEntries: number): string | null {
    if (this.assigneeCount.size <= maxEntries) return null;
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();
    for (const [key, data] of this.assigneeCount.entries()) {
      if (data.timestamp < oldestTimestamp) {
        oldestTimestamp = data.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) this.assigneeCount.delete(oldestKey);
    return oldestKey;
  }
}

/** Default singleton cache instance */
export const cache = new CacheStore();

/** @deprecated Use cache.assigneeCount */
export const assigneeCountCache = cache.assigneeCount;
/** @deprecated Use cache.inflight */
export const inflightRequests = cache.inflight;
/** @deprecated Use cache.sprintLayout */
export const sprintLayoutCache = cache.sprintLayout;
/** @deprecated Use cache.storyAssignee */
export const storyAssigneeCache = cache.storyAssignee;
/** @deprecated Use cache.storyPwDetail */
export const storyPwDetailCache = cache.storyPwDetail;
/** @deprecated Use cache.isExpired */
export const isCacheExpired = (epicKey: string, cacheTtlMs: number): boolean => cache.isExpired(epicKey, cacheTtlMs);
/** @deprecated Use cache.evictOldest */
export const evictOldestCacheEntry = (maxEntries: number): string | null => cache.evictOldest(maxEntries);
