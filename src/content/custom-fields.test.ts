/**
 * Tests for Custom Field ID Detection
 */

import { getCustomFieldIds, CustomFieldIds } from './custom-fields';

// ---------------------------------------------------------------------------
// Mock chrome.storage.local
// ---------------------------------------------------------------------------
const storageData: Record<string, any> = {};

beforeEach(() => {
  Object.keys(storageData).forEach((k) => delete storageData[k]);

  (chrome.storage as any).local = {
    get: jest.fn((key: string) => Promise.resolve({ [key]: storageData[key] })),
    set: jest.fn((items: Record<string, any>) => {
      Object.assign(storageData, items);
      return Promise.resolve();
    }),
  };

  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Standard Jira field API response fixtures
const SPRINT_FIELD = {
  id: 'customfield_10020',
  name: 'Sprint',
  custom: true,
  schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' },
};

const STORY_POINTS_FIELD = {
  id: 'customfield_10028',
  name: 'Story Points',
  custom: true,
  schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' },
};

const UNRELATED_FLOAT_FIELD = {
  id: 'customfield_99999',
  name: 'Business Value',
  custom: true,
  schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' },
};

// ===========================================================================
// getCustomFieldIds — cache hit
// ===========================================================================
describe('getCustomFieldIds', () => {
  // jsdom default location is http://localhost — tests use that hostname for cache keys

  it('returns cached fields if within TTL', async () => {
    const cached: CustomFieldIds = {
      sprintFieldId: 'customfield_10020',
      storyPointsFieldId: 'customfield_10028',
      fetchedAt: Date.now() - 1000,
    };
    storageData['customFieldIds'] = { 'localhost': cached };

    const result = await getCustomFieldIds();
    expect(result).toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores expired cache entries', async () => {
    const expired: CustomFieldIds = {
      sprintFieldId: 'old_sprint',
      storyPointsFieldId: 'old_points',
      fetchedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    };
    storageData['customFieldIds'] = { 'localhost': expired };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([SPRINT_FIELD, STORY_POINTS_FIELD]),
    });

    const result = await getCustomFieldIds();
    expect(result.sprintFieldId).toBe('customfield_10020');
    expect(result.storyPointsFieldId).toBe('customfield_10028');
  });

  // ===========================================================================
  // getCustomFieldIds — API fetch
  // ===========================================================================
  it('fetches from API and caches when no cache exists', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([SPRINT_FIELD, STORY_POINTS_FIELD, UNRELATED_FLOAT_FIELD]),
    });

    const result = await getCustomFieldIds();
    expect(result.sprintFieldId).toBe('customfield_10020');
    expect(result.storyPointsFieldId).toBe('customfield_10028');
    expect(result.fetchedAt).toBeGreaterThan(0);

    // Verify saved to storage
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('matches Sprint by gh-sprint schema', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'customfield_11002', name: 'Sprint', custom: true, schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
          STORY_POINTS_FIELD,
        ]),
    });

    const result = await getCustomFieldIds();
    expect(result.sprintFieldId).toBe('customfield_11002');
  });

  it('matches Sprint by "sprint" in schema custom type', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'customfield_55555', name: 'Sprint', custom: true, schema: { custom: 'com.example:sprint' } },
          STORY_POINTS_FIELD,
        ]),
    });

    const result = await getCustomFieldIds();
    expect(result.sprintFieldId).toBe('customfield_55555');
  });

  it('matches Story Points by schema type + name', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          SPRINT_FIELD,
          {
            id: 'customfield_10003',
            name: 'Story Points',
            custom: true,
            schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' },
          },
          UNRELATED_FLOAT_FIELD,
        ]),
    });

    const result = await getCustomFieldIds();
    expect(result.storyPointsFieldId).toBe('customfield_10003');
  });

  it('matches Story Point Estimate name variant', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          SPRINT_FIELD,
          {
            id: 'customfield_10044',
            name: 'Story Point Estimate',
            custom: true,
            schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' },
          },
        ]),
    });

    const result = await getCustomFieldIds();
    expect(result.storyPointsFieldId).toBe('customfield_10044');
  });

  it('matches Story Points by schema with story-points in custom type', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          SPRINT_FIELD,
          {
            id: 'customfield_10099',
            name: 'Story Points',
            custom: true,
            schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:story-points' },
          },
        ]),
    });

    const result = await getCustomFieldIds();
    expect(result.storyPointsFieldId).toBe('customfield_10099');
  });

  it('falls back to name-only match for Story Points when schema does not match', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          SPRINT_FIELD,
          {
            id: 'customfield_77777',
            name: 'Story Points',
            custom: true,
            schema: { type: 'string', custom: 'com.custom:something' },
          },
        ]),
    });

    const result = await getCustomFieldIds();
    expect(result.storyPointsFieldId).toBe('customfield_77777');
  });

  it('matches Story Points via untranslatedName', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          SPRINT_FIELD,
          {
            id: 'customfield_88888',
            name: 'ストーリーポイント',
            untranslatedName: 'Story Points',
            custom: true,
            schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' },
          },
        ]),
    });

    const result = await getCustomFieldIds();
    expect(result.storyPointsFieldId).toBe('customfield_88888');
  });

  it('does not match unrelated float fields as Story Points', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          SPRINT_FIELD,
          UNRELATED_FLOAT_FIELD, // "Business Value" — float but not Story Points
        ]),
    });

    // No story points field found → returns null from fetch → falls to defaults
    const result = await getCustomFieldIds();
    expect(result.storyPointsFieldId).toBe('customfield_10003'); // default
  });

  // ===========================================================================
  // getCustomFieldIds — fallback to defaults
  // ===========================================================================
  it('returns defaults when API returns non-OK', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await getCustomFieldIds();
    expect(result.sprintFieldId).toBe('customfield_11002');
    expect(result.storyPointsFieldId).toBe('customfield_10003');
    expect(result.fetchedAt).toBe(0);
  });

  it('returns defaults when fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const result = await getCustomFieldIds();
    expect(result.sprintFieldId).toBe('customfield_11002');
    expect(result.storyPointsFieldId).toBe('customfield_10003');
  });

  it('returns defaults when neither field detected', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'summary', name: 'Summary', custom: false },
          { id: 'status', name: 'Status', custom: false },
        ]),
    });

    const result = await getCustomFieldIds();
    expect(result.sprintFieldId).toBe('customfield_11002');
    expect(result.storyPointsFieldId).toBe('customfield_10003');
  });

  it('handles storage error gracefully', async () => {
    (chrome.storage.local.get as jest.Mock).mockRejectedValueOnce(new Error('Storage full'));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([SPRINT_FIELD, STORY_POINTS_FIELD]),
    });

    const result = await getCustomFieldIds();
    expect(result.sprintFieldId).toBe('customfield_10020');
  });

  it('preserves other domains cache when saving', async () => {
    storageData['customFieldIds'] = {
      'other.example.com': {
        sprintFieldId: 'customfield_99',
        storyPointsFieldId: 'customfield_88',
        fetchedAt: Date.now(),
      },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([SPRINT_FIELD, STORY_POINTS_FIELD]),
    });

    await getCustomFieldIds();

    const saved = storageData['customFieldIds'];
    expect(saved['other.example.com'].sprintFieldId).toBe('customfield_99');
    expect(saved['localhost'].sprintFieldId).toBe('customfield_10020');
  });
});
