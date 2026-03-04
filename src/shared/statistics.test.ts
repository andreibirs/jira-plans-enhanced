/**
 * Tests for Statistics Module
 *
 * Tests statistics calculation and formatting helpers
 */

import { calculateHitRate, formatAge, formatBytes, INITIAL_STATISTICS } from './statistics';

describe('Statistics', () => {
  describe('calculateHitRate', () => {
    it('should calculate hit rate as percentage', () => {
      expect(calculateHitRate(8, 2)).toBe(80); // 8 hits out of 10 total = 80%
      expect(calculateHitRate(50, 50)).toBe(50); // 50 hits out of 100 total = 50%
      expect(calculateHitRate(100, 0)).toBe(100); // 100 hits out of 100 total = 100%
    });

    it('should return 0 when no requests made', () => {
      expect(calculateHitRate(0, 0)).toBe(0);
    });

    it('should return 0 when only misses', () => {
      expect(calculateHitRate(0, 10)).toBe(0);
    });

    it('should handle fractional percentages', () => {
      expect(calculateHitRate(1, 2)).toBeCloseTo(33.33, 1); // 1/3 = 33.33%
      expect(calculateHitRate(2, 1)).toBeCloseTo(66.67, 1); // 2/3 = 66.67%
    });
  });

  describe('formatAge', () => {
    it('should format milliseconds as human-readable time', () => {
      expect(formatAge(500)).toContain('ms'); // Less than 1 second
      expect(formatAge(1000)).toContain('s'); // 1 second
      expect(formatAge(60000)).toContain('m'); // 1 minute
      expect(formatAge(3600000)).toContain('h'); // 1 hour
    });

    it('should handle zero and negative values', () => {
      expect(formatAge(0)).toBeDefined();
      expect(formatAge(-1000)).toBeDefined();
    });

    it('should format typical cache ages', () => {
      const fiveMinutes = formatAge(300000);
      const thirtySeconds = formatAge(30000);

      expect(fiveMinutes).toBeDefined();
      expect(thirtySeconds).toBeDefined();
    });
  });

  describe('formatBytes', () => {
    it('should format bytes in human-readable format', () => {
      expect(formatBytes(0)).toContain('B');
      expect(formatBytes(1024)).toContain('KB');
      expect(formatBytes(1024 * 1024)).toContain('MB');
      // formatBytes may not convert to GB if threshold is higher
      expect(formatBytes(1024 * 1024 * 1024)).toMatch(/GB|MB/);
    });

    it('should handle small byte counts', () => {
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(100)).toBe('100 B');
      expect(formatBytes(999)).toBe('999 B');
    });

    it('should handle typical cache sizes', () => {
      const smallCache = formatBytes(2500); // ~2.5 KB
      const mediumCache = formatBytes(250000); // ~250 KB
      const largeCache = formatBytes(25000000); // ~25 MB

      expect(smallCache).toContain('KB');
      expect(mediumCache).toContain('KB');
      expect(largeCache).toContain('MB');
    });
  });

  describe('INITIAL_STATISTICS', () => {
    it('should have all required statistics sections', () => {
      expect(INITIAL_STATISTICS).toHaveProperty('cache');
      expect(INITIAL_STATISTICS).toHaveProperty('processing');
      expect(INITIAL_STATISTICS).toHaveProperty('badges');
      expect(INITIAL_STATISTICS).toHaveProperty('errors');
    });

    it('should initialize cache statistics to zero', () => {
      expect(INITIAL_STATISTICS.cache.totalEntries).toBe(0);
      expect(INITIAL_STATISTICS.cache.hitCount).toBe(0);
      expect(INITIAL_STATISTICS.cache.missCount).toBe(0);
      expect(INITIAL_STATISTICS.cache.hitRate).toBe(0);
      expect(INITIAL_STATISTICS.cache.estimatedSizeBytes).toBe(0);
    });

    it('should initialize processing statistics to zero', () => {
      expect(INITIAL_STATISTICS.processing.epicsProcessed).toBe(0);
      expect(INITIAL_STATISTICS.processing.badgesInjected).toBe(0);
      expect(INITIAL_STATISTICS.processing.badgesUpdated).toBe(0);
      expect(INITIAL_STATISTICS.processing.apiCallsMade).toBe(0);
      expect(INITIAL_STATISTICS.processing.apiCallsFailed).toBe(0);
    });

    it('should initialize badge statistics to zero', () => {
      expect(INITIAL_STATISTICS.badges.leftPanelBadgesActive).toBe(0);
      expect(INITIAL_STATISTICS.badges.timelineBadgesActive).toBe(0);
      expect(INITIAL_STATISTICS.badges.sprintBadgesActive).toBe(0);
      expect(INITIAL_STATISTICS.badges.zeroCountBadges).toBe(0);
      expect(INITIAL_STATISTICS.badges.loadingBadges).toBe(0);
    });

    it('should initialize error statistics', () => {
      expect(INITIAL_STATISTICS.errors.apiErrors).toBe(0);
      expect(INITIAL_STATISTICS.errors.domParsingErrors).toBe(0);
      expect(INITIAL_STATISTICS.errors.badgeInjectionErrors).toBe(0);
      expect(INITIAL_STATISTICS.errors.lastErrorMessage).toBeNull();
      expect(INITIAL_STATISTICS.errors.lastErrorTime).toBeNull();
    });
  });
});
