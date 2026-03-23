/**
 * Custom Field ID Detection
 *
 * Auto-detects custom field IDs for Sprint and Story Points from the Jira API.
 * Results are cached per domain in chrome.storage.local.
 *
 * Different Jira instances use different custom field IDs for the same concepts.
 * For example, Sprint might be customfield_11002 on one instance and customfield_10020
 * on another. This module detects the correct IDs via /rest/api/2/field.
 */

/** Default custom field IDs — fallback if API detection fails */
const DEFAULT_SPRINT_FIELD_ID = 'customfield_11002';
const DEFAULT_STORY_POINTS_FIELD_ID = 'customfield_10003';

/** Cache TTL: 7 days (custom field IDs rarely change) */
const FIELD_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const STORAGE_KEY = 'customFieldIds';

export interface CustomFieldIds {
  sprintFieldId: string;
  storyPointsFieldId: string;
  fetchedAt: number;
}

interface PerDomainCache {
  [hostname: string]: CustomFieldIds;
}

/**
 * Load cached custom field IDs for the current hostname from chrome.storage.local.
 * Returns null if not cached or expired.
 */
async function loadCachedFields(hostname: string): Promise<CustomFieldIds | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cache: PerDomainCache = result[STORAGE_KEY] || {};
    const entry = cache[hostname];

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.fetchedAt > FIELD_CACHE_TTL_MS) return null;

    return entry;
  } catch {
    return null;
  }
}

/**
 * Save custom field IDs for a hostname to chrome.storage.local.
 */
async function saveCachedFields(hostname: string, fields: CustomFieldIds): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cache: PerDomainCache = result[STORAGE_KEY] || {};
    cache[hostname] = fields;
    await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  } catch (error) {
    console.error('[Headcount] Failed to save custom field cache:', error);
  }
}

/**
 * Fetch all fields from Jira API and find Sprint and Story Points custom field IDs.
 *
 * The /rest/api/2/field endpoint returns all fields including custom ones:
 * [
 *   { "id": "customfield_10003", "name": "Story Points", "custom": true, "schema": { "type": "number", "custom": "com.atlassian.jira.plugin.system.customfieldtypes:float" } },
 *   { "id": "customfield_11002", "name": "Sprint", "custom": true, "schema": { "custom": "com.pyxis.greenhopper.jira:gh-sprint" } },
 *   ...
 * ]
 *
 * We match by schema type (most reliable) and fall back to name matching.
 */
async function fetchCustomFieldIds(baseUrl: string): Promise<CustomFieldIds | null> {
  try {
    const response = await fetch(`${baseUrl}/rest/api/2/field`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const fields: Array<{
      id: string;
      name: string;
      custom: boolean;
      untranslatedName?: string;
      schema?: { type?: string; custom?: string };
    }> = await response.json();

    let sprintFieldId: string | null = null;
    let storyPointsFieldId: string | null = null;

    for (const field of fields) {
      const schemaCustom = field.schema?.custom || '';
      const name = (field.name || '').toLowerCase();
      const untranslatedName = (field.untranslatedName || '').toLowerCase();

      // Sprint: match by schema type (greenhopper sprint custom type)
      if (schemaCustom.includes('gh-sprint') || schemaCustom.includes('sprint')) {
        sprintFieldId = field.id;
      }

      // Story Points: match by schema type first, then name
      if (
        schemaCustom.includes('story-points') ||
        schemaCustom === 'com.atlassian.jira.plugin.system.customfieldtypes:float'
      ) {
        // Float type — could be story points, verify by name
        if (name === 'story points' || untranslatedName === 'story points' || name === 'story point estimate') {
          storyPointsFieldId = field.id;
        }
      }
    }

    // Second pass: if story points not found by schema+name, try name-only match
    if (!storyPointsFieldId) {
      for (const field of fields) {
        const name = (field.name || '').toLowerCase();
        const untranslatedName = (field.untranslatedName || '').toLowerCase();
        if (name === 'story points' || untranslatedName === 'story points' || name === 'story point estimate') {
          storyPointsFieldId = field.id;
          break;
        }
      }
    }

    if (!sprintFieldId || !storyPointsFieldId) return null;

    return {
      sprintFieldId,
      storyPointsFieldId,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Get custom field IDs for the current domain.
 * Tries cache first, then API, then falls back to hardcoded defaults.
 */
export async function getCustomFieldIds(): Promise<CustomFieldIds> {
  const hostname = location.hostname;
  const baseUrl = `${location.protocol}//${hostname}`;

  // 1. Try cache
  const cached = await loadCachedFields(hostname);
  if (cached) return cached;

  // 2. Try API
  const fetched = await fetchCustomFieldIds(baseUrl);
  if (fetched) {
    await saveCachedFields(hostname, fetched);
    return fetched;
  }

  // 3. Fallback to defaults
  const defaults: CustomFieldIds = {
    sprintFieldId: DEFAULT_SPRINT_FIELD_ID,
    storyPointsFieldId: DEFAULT_STORY_POINTS_FIELD_ID,
    fetchedAt: 0, // Mark as unfetched so it retries next time
  };
  return defaults;
}
