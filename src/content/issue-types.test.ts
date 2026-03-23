/**
 * Tests for Issue Type Avatar Detection
 */

import { extractAvatarId, getIssueTypeAvatars, IssueTypeAvatars } from './issue-types';

// ---------------------------------------------------------------------------
// Mock chrome.storage.local (setup.ts only mocks .sync)
// ---------------------------------------------------------------------------
const storageData: Record<string, any> = {};

beforeEach(() => {
  // Reset storage
  Object.keys(storageData).forEach((k) => delete storageData[k]);

  (chrome.storage as any).local = {
    get: jest.fn((key: string) => Promise.resolve({ [key]: storageData[key] })),
    set: jest.fn((items: Record<string, any>) => {
      Object.assign(storageData, items);
      return Promise.resolve();
    }),
  };

  // Reset fetch mock
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ===========================================================================
// extractAvatarId
// ===========================================================================
describe('extractAvatarId', () => {
  it('extracts avatarId from Jira Server/DC URL with avatarId param', () => {
    expect(extractAvatarId('/secure/viewavatar?size=xsmall&avatarId=18807&avatarType=issuetype')).toBe('18807');
  });

  it('extracts avatarId from Jira Cloud URL with /avatar/ path', () => {
    expect(extractAvatarId('https://example.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10307')).toBe('10307');
  });

  it('returns null when no avatar ID pattern found', () => {
    expect(extractAvatarId('/images/icons/issuetypes/epic.svg')).toBeNull();
    expect(extractAvatarId('')).toBeNull();
  });

  it('prefers avatarId param over path when both present', () => {
    // Edge case: both patterns in URL — param match comes first
    expect(extractAvatarId('/avatar/999?avatarId=123')).toBe('123');
  });
});

// ===========================================================================
// getIssueTypeAvatars — cache hit
// ===========================================================================
describe('getIssueTypeAvatars', () => {
  // jsdom default location is http://localhost — tests use that hostname for cache keys

  it('returns cached avatars if within TTL', async () => {
    const cached: IssueTypeAvatars = {
      epicAvatarId: '111',
      storyAvatarId: '222',
      fetchedAt: Date.now() - 1000, // 1 second ago
    };
    storageData['issueTypeAvatars'] = { 'localhost': cached };

    const result = await getIssueTypeAvatars();
    expect(result).toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores expired cache entries', async () => {
    const expired: IssueTypeAvatars = {
      epicAvatarId: '111',
      storyAvatarId: '222',
      fetchedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
    };
    storageData['issueTypeAvatars'] = { 'localhost': expired };

    // API returns data
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: 'Epic', iconUrl: '/avatar?avatarId=333', untranslatedName: 'Epic' },
          { name: 'Story', iconUrl: '/avatar?avatarId=444', untranslatedName: 'Story' },
        ]),
    });

    const result = await getIssueTypeAvatars();
    expect(result.epicAvatarId).toBe('333');
    expect(result.storyAvatarId).toBe('444');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // ===========================================================================
  // getIssueTypeAvatars — API fetch
  // ===========================================================================
  it('fetches from API and caches when no cache exists', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: 'Bug', iconUrl: '/avatar?avatarId=100' },
          { name: 'Epic', iconUrl: '/secure/viewavatar?avatarId=200&avatarType=issuetype' },
          { name: 'Story', iconUrl: 'https://localhost/rest/api/2/universal_avatar/view/type/issuetype/avatar/300' },
          { name: 'Task', iconUrl: '/avatar?avatarId=400' },
        ]),
    });

    const result = await getIssueTypeAvatars();
    expect(result.epicAvatarId).toBe('200');
    expect(result.storyAvatarId).toBe('300');
    expect(result.fetchedAt).toBeGreaterThan(0);

    // Verify saved to storage
    expect(chrome.storage.local.set).toHaveBeenCalled();
    const saved = storageData['issueTypeAvatars']?.['localhost'];
    expect(saved?.epicAvatarId).toBe('200');
  });

  it('handles i18n instances via untranslatedName', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: 'エピック', untranslatedName: 'Epic', iconUrl: '/avatar?avatarId=555' },
          { name: 'ストーリー', untranslatedName: 'Story', iconUrl: '/avatar?avatarId=666' },
        ]),
    });

    const result = await getIssueTypeAvatars();
    expect(result.epicAvatarId).toBe('555');
    expect(result.storyAvatarId).toBe('666');
  });

  it('skips issue types without iconUrl', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: 'Epic' }, // no iconUrl
          { name: 'Story', iconUrl: '/avatar?avatarId=777' },
        ]),
    });

    // Should fall back to defaults since Epic couldn't be detected
    const result = await getIssueTypeAvatars();
    expect(result.epicAvatarId).toBe('18807'); // default
  });

  // ===========================================================================
  // getIssueTypeAvatars — fallback to defaults
  // ===========================================================================
  it('returns defaults when API fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 403 });

    const result = await getIssueTypeAvatars();
    expect(result.epicAvatarId).toBe('18807');
    expect(result.storyAvatarId).toBe('18815');
    expect(result.fetchedAt).toBe(0);
  });

  it('returns defaults when fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const result = await getIssueTypeAvatars();
    expect(result.epicAvatarId).toBe('18807');
    expect(result.storyAvatarId).toBe('18815');
  });

  it('returns defaults when only Epic found (Story missing)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: 'Epic', iconUrl: '/avatar?avatarId=888' },
          { name: 'Bug', iconUrl: '/avatar?avatarId=999' },
        ]),
    });

    const result = await getIssueTypeAvatars();
    expect(result.epicAvatarId).toBe('18807'); // defaults — both must be found
    expect(result.storyAvatarId).toBe('18815');
  });

  it('handles storage.local.get throwing', async () => {
    (chrome.storage.local.get as jest.Mock).mockRejectedValueOnce(new Error('Storage error'));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: 'Epic', iconUrl: '/avatar?avatarId=111' },
          { name: 'Story', iconUrl: '/avatar?avatarId=222' },
        ]),
    });

    const result = await getIssueTypeAvatars();
    expect(result.epicAvatarId).toBe('111');
  });

  it('caches per domain', async () => {
    const otherDomainCached = {
      'other.example.com': {
        epicAvatarId: '999',
        storyAvatarId: '888',
        fetchedAt: Date.now(),
      },
    };
    storageData['issueTypeAvatars'] = otherDomainCached;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: 'Epic', iconUrl: '/avatar?avatarId=111' },
          { name: 'Story', iconUrl: '/avatar?avatarId=222' },
        ]),
    });

    await getIssueTypeAvatars();

    // Should preserve other domain's cache
    const saved = storageData['issueTypeAvatars'];
    expect(saved['other.example.com'].epicAvatarId).toBe('999');
    expect(saved['localhost'].epicAvatarId).toBe('111');
  });
});
