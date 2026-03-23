/**
 * Issue Type Avatar Detection
 *
 * Auto-detects avatarId values for Epic and Story issue types from the Jira API.
 * Results are cached per domain in chrome.storage.local.
 */

/** Default avatar IDs — fallback if API detection fails */
const DEFAULT_EPIC_AVATAR_ID = '18807';
const DEFAULT_STORY_AVATAR_ID = '18815';

/** Cache TTL: 7 days (avatar IDs rarely change) */
const AVATAR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const STORAGE_KEY = 'issueTypeAvatars';

export interface IssueTypeAvatars {
  epicAvatarId: string;
  storyAvatarId: string;
  fetchedAt: number;
}

interface PerDomainCache {
  [hostname: string]: IssueTypeAvatars;
}

/**
 * Extract avatarId from an icon URL.
 * Handles patterns like:
 * - "/secure/viewavatar?size=xsmall&avatarId=18807&avatarType=issuetype"
 * - "https://example.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10307"
 */
export function extractAvatarId(iconUrl: string): string | null {
  // Pattern 1: avatarId query param (Jira Server/DC)
  const paramMatch = iconUrl.match(/avatarId=(\d+)/);
  if (paramMatch) return paramMatch[1];

  // Pattern 2: /avatar/{id} path segment (Jira Cloud)
  const pathMatch = iconUrl.match(/\/avatar\/(\d+)/);
  if (pathMatch) return pathMatch[1];

  return null;
}

/**
 * Load cached avatar IDs for the current hostname from chrome.storage.local.
 * Returns null if not cached or expired.
 */
async function loadCachedAvatars(hostname: string): Promise<IssueTypeAvatars | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cache: PerDomainCache = result[STORAGE_KEY] || {};
    const entry = cache[hostname];

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.fetchedAt > AVATAR_CACHE_TTL_MS) return null;

    return entry;
  } catch {
    return null;
  }
}

/**
 * Save avatar IDs for a hostname to chrome.storage.local.
 */
async function saveCachedAvatars(hostname: string, avatars: IssueTypeAvatars): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cache: PerDomainCache = result[STORAGE_KEY] || {};
    cache[hostname] = avatars;
    await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  } catch (error) {
    console.error('[Headcount] Failed to save avatar cache:', error);
  }
}

/**
 * Fetch issue types from Jira API and extract avatar IDs for Epic and Story.
 */
async function fetchIssueTypeAvatars(baseUrl: string): Promise<IssueTypeAvatars | null> {
  try {
    const response = await fetch(`${baseUrl}/rest/api/2/issuetype`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const issueTypes: Array<{ name: string; iconUrl?: string; untranslatedName?: string }> = await response.json();

    let epicAvatarId: string | null = null;
    let storyAvatarId: string | null = null;

    for (const issueType of issueTypes) {
      if (!issueType.iconUrl) continue;

      const avatarId = extractAvatarId(issueType.iconUrl);
      if (!avatarId) continue;

      // Match by name (case-insensitive) — also check untranslatedName for i18n instances
      const name = (issueType.name || '').toLowerCase();
      const untranslatedName = (issueType.untranslatedName || '').toLowerCase();

      if (name === 'epic' || untranslatedName === 'epic') {
        epicAvatarId = avatarId;
      } else if (name === 'story' || untranslatedName === 'story') {
        storyAvatarId = avatarId;
      }
    }

    if (!epicAvatarId || !storyAvatarId) return null;

    return {
      epicAvatarId,
      storyAvatarId,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Get avatar IDs for the current domain.
 * Tries cache first, then API, then falls back to hardcoded defaults.
 */
export async function getIssueTypeAvatars(): Promise<IssueTypeAvatars> {
  const hostname = location.hostname;
  const baseUrl = `${location.protocol}//${hostname}`;

  // 1. Try cache
  const cached = await loadCachedAvatars(hostname);
  if (cached) return cached;

  // 2. Try API
  const fetched = await fetchIssueTypeAvatars(baseUrl);
  if (fetched) {
    await saveCachedAvatars(hostname, fetched);
    return fetched;
  }

  // 3. Fallback to defaults
  const defaults: IssueTypeAvatars = {
    epicAvatarId: DEFAULT_EPIC_AVATAR_ID,
    storyAvatarId: DEFAULT_STORY_AVATAR_ID,
    fetchedAt: 0, // Mark as unfetched so it retries next time
  };
  return defaults;
}
