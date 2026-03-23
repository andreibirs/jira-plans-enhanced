/**
 * Tests for CacheStore
 */

import { CacheStore, ERROR_CACHE_TTL_MS } from './cache';

describe('CacheStore', () => {
  let store: CacheStore;

  beforeEach(() => {
    store = new CacheStore();
  });

  describe('populate', () => {
    it('creates a cache entry with correct totalCount', () => {
      store.populate('EPIC-1', 5);
      const entry = store.assigneeCount.get('EPIC-1');
      expect(entry).toBeDefined();
      expect(entry!.totalCount).toBe(5);
    });

    it('creates entry with provided assignees', () => {
      const assignees = [{ accountId: 'a1', displayName: 'Alice', avatarUrls: { '16x16': '', '24x24': '', '32x32': '', '48x48': '' } }];
      store.populate('EPIC-2', 1, assignees);
      expect(store.assigneeCount.get('EPIC-2')!.totalAssignees).toEqual(assignees);
    });

    it('creates entry with empty Maps and defaults', () => {
      store.populate('EPIC-3', 0);
      const entry = store.assigneeCount.get('EPIC-3')!;
      expect(entry.sprintCounts.size).toBe(0);
      expect(entry.sprintAssignees.size).toBe(0);
      expect(entry.effortPerPersonPerSprint.size).toBe(0);
      expect(entry.effortPerPersonCurrentSprints.size).toBe(0);
      expect(entry.estimatedStoryCount).toBe(0);
      expect(entry.totalStoryCount).toBe(0);
    });
  });

  describe('clear', () => {
    it('empties all caches', () => {
      store.populate('EPIC-1', 5);
      store.inflight.add('EPIC-2');
      store.storyAssignee.set('STORY-1', { accountId: 'b1', displayName: 'Bob', avatarUrls: { '16x16': '', '24x24': '', '32x32': '', '48x48': '' } });
      store.storyPwDetail.set('STORY-1', null);

      store.clear();

      expect(store.assigneeCount.size).toBe(0);
      expect(store.inflight.size).toBe(0);
      expect(store.storyAssignee.size).toBe(0);
      expect(store.storyPwDetail.size).toBe(0);
    });
  });

  describe('isExpired', () => {
    it('returns true when entry does not exist', () => {
      expect(store.isExpired('NONEXISTENT', 300000)).toBe(true);
    });

    it('returns false for fresh entry within TTL', () => {
      store.populate('EPIC-1', 5);
      expect(store.isExpired('EPIC-1', 300000)).toBe(false);
    });

    it('returns true for expired entry', () => {
      store.populate('EPIC-1', 5);
      // Force old timestamp
      store.assigneeCount.get('EPIC-1')!.timestamp = Date.now() - 400000;
      expect(store.isExpired('EPIC-1', 300000)).toBe(true);
    });

    it('uses ERROR_CACHE_TTL_MS for error entries', () => {
      store.populate('EPIC-ERR', 0);
      const entry = store.assigneeCount.get('EPIC-ERR')!;
      entry.isError = true;
      entry.timestamp = Date.now() - ERROR_CACHE_TTL_MS - 1;
      expect(store.isExpired('EPIC-ERR', 300000)).toBe(true);
    });

    it('keeps error entries alive within ERROR_CACHE_TTL_MS', () => {
      store.populate('EPIC-ERR', 0);
      const entry = store.assigneeCount.get('EPIC-ERR')!;
      entry.isError = true;
      entry.timestamp = Date.now() - 10000; // 10 seconds, within 30s error TTL
      expect(store.isExpired('EPIC-ERR', 300000)).toBe(false);
    });
  });

  describe('evictOldest', () => {
    it('returns null when under maxEntries', () => {
      store.populate('EPIC-1', 1);
      store.populate('EPIC-2', 2);
      expect(store.evictOldest(5)).toBeNull();
    });

    it('evicts the oldest entry when over maxEntries', () => {
      store.populate('EPIC-A', 1);
      store.assigneeCount.get('EPIC-A')!.timestamp = 1000;

      store.populate('EPIC-B', 2);
      store.assigneeCount.get('EPIC-B')!.timestamp = 2000;

      store.populate('EPIC-C', 3);
      store.assigneeCount.get('EPIC-C')!.timestamp = 3000;

      const evicted = store.evictOldest(2);
      expect(evicted).toBe('EPIC-A');
      expect(store.assigneeCount.has('EPIC-A')).toBe(false);
      expect(store.assigneeCount.size).toBe(2);
    });

    it('returns null when exactly at maxEntries', () => {
      store.populate('EPIC-1', 1);
      store.populate('EPIC-2', 2);
      expect(store.evictOldest(2)).toBeNull();
    });
  });
});

describe('ERROR_CACHE_TTL_MS', () => {
  it('is 30 seconds', () => {
    expect(ERROR_CACHE_TTL_MS).toBe(30000);
  });
});
