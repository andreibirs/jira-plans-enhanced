/**
 * Tests for Person-Weeks computation logic
 */

import type { CachedAssigneeData, PersonEffort } from './cache';
import {
  effortToPersonWeeks,
  personEffortToPw,
  computePersonWeeks,
  buildPwOverride,
  parseSprint,
} from './person-weeks';
import type { PwSettings } from './person-weeks';

// ---------------------------------------------------------------------------
// Helper: build a minimal CachedAssigneeData
// ---------------------------------------------------------------------------
function makeCachedData(overrides: Partial<CachedAssigneeData> = {}): CachedAssigneeData {
  return {
    totalCount: 0,
    sprintCounts: new Map(),
    timestamp: Date.now(),
    sprintAssignees: new Map(),
    totalAssignees: [],
    effortPerPersonPerSprint: new Map(),
    effortPerPersonCurrentSprints: new Map(),
    estimatedStoryCount: 0,
    totalStoryCount: 0,
    ...overrides,
  };
}

function makeEffortMap(
  entries: Array<[string, Array<[string, PersonEffort]>]>,
): Map<string, Map<string, PersonEffort>> {
  const outer = new Map<string, Map<string, PersonEffort>>();
  for (const [sprint, people] of entries) {
    outer.set(sprint, new Map(people));
  }
  return outer;
}

// ===========================================================================
// effortToPersonWeeks
// ===========================================================================
describe('effortToPersonWeeks', () => {
  const spThreshold = 5;
  const pdThreshold = 4;

  it('returns 0 for null effort', () => {
    expect(effortToPersonWeeks(null, 'sp', spThreshold, pdThreshold)).toBe(0);
  });

  it('returns 0 for undefined effort', () => {
    expect(effortToPersonWeeks(undefined, 'sp', spThreshold, pdThreshold)).toBe(0);
  });

  it('returns 0 for zero effort', () => {
    expect(effortToPersonWeeks(0, 'sp', spThreshold, pdThreshold)).toBe(0);
  });

  it('returns 0 for negative effort', () => {
    expect(effortToPersonWeeks(-3, 'pd', spThreshold, pdThreshold)).toBe(0);
  });

  it('returns 1 PW when SP effort <= threshold', () => {
    expect(effortToPersonWeeks(3, 'sp', spThreshold, pdThreshold)).toBe(1);
    expect(effortToPersonWeeks(5, 'sp', spThreshold, pdThreshold)).toBe(1);
  });

  it('returns 2 PW when SP effort > threshold', () => {
    expect(effortToPersonWeeks(6, 'sp', spThreshold, pdThreshold)).toBe(2);
    expect(effortToPersonWeeks(13, 'sp', spThreshold, pdThreshold)).toBe(2);
  });

  it('returns 1 PW when PD effort <= threshold', () => {
    expect(effortToPersonWeeks(2, 'pd', spThreshold, pdThreshold)).toBe(1);
    expect(effortToPersonWeeks(4, 'pd', spThreshold, pdThreshold)).toBe(1);
  });

  it('returns 2 PW when PD effort > threshold', () => {
    expect(effortToPersonWeeks(5, 'pd', spThreshold, pdThreshold)).toBe(2);
    expect(effortToPersonWeeks(10, 'pd', spThreshold, pdThreshold)).toBe(2);
  });

  it('uses correct threshold per unit', () => {
    // sp=5, pd=4 → same effort=5 should be 1 PW for SP, 2 PW for PD
    expect(effortToPersonWeeks(5, 'sp', 5, 4)).toBe(1);
    expect(effortToPersonWeeks(5, 'pd', 5, 4)).toBe(2);
  });
});

// ===========================================================================
// personEffortToPw
// ===========================================================================
describe('personEffortToPw', () => {
  const spT = 5;
  const pdT = 4;

  it('returns 0 when both SP and PD are 0', () => {
    expect(personEffortToPw({ sp: 0, pd: 0 }, spT, pdT)).toBe(0);
  });

  it('uses SP when only SP is present', () => {
    expect(personEffortToPw({ sp: 3, pd: 0 }, spT, pdT)).toBe(1);
    expect(personEffortToPw({ sp: 8, pd: 0 }, spT, pdT)).toBe(2);
  });

  it('uses PD when only PD is present', () => {
    expect(personEffortToPw({ sp: 0, pd: 3 }, spT, pdT)).toBe(1);
    expect(personEffortToPw({ sp: 0, pd: 5 }, spT, pdT)).toBe(2);
  });

  it('takes max of SP and PD when both present', () => {
    // SP → 1 PW, PD → 2 PW → max = 2
    expect(personEffortToPw({ sp: 3, pd: 5 }, spT, pdT)).toBe(2);
  });

  it('caps at 2 PW', () => {
    // Both high → still 2
    expect(personEffortToPw({ sp: 13, pd: 10 }, spT, pdT)).toBe(2);
  });
});

// ===========================================================================
// computePersonWeeks
// ===========================================================================
describe('computePersonWeeks', () => {
  const baseSettings = { pwSource: 'stories' as const, spThresholdPerPw: 5, pdThresholdPerPw: 4 };

  describe('story-level (pwSource=stories)', () => {
    it('returns 0 for empty effort maps', () => {
      const data = makeCachedData();
      const result = computePersonWeeks(data, baseSettings);
      expect(result).toEqual({ total: 0, remaining: 0, epicLevel: false });
    });

    it('sums effort across sprints and people', () => {
      const data = makeCachedData({
        effortPerPersonPerSprint: makeEffortMap([
          ['Sprint 1', [['alice', { sp: 3, pd: 0 }], ['bob', { sp: 8, pd: 0 }]]],
          ['Sprint 2', [['alice', { sp: 2, pd: 0 }]]],
        ]),
        effortPerPersonCurrentSprints: makeEffortMap([
          ['Sprint 2', [['alice', { sp: 2, pd: 0 }]]],
        ]),
      });
      // Sprint 1: alice=1PW, bob=2PW → 3. Sprint 2: alice=1PW → 1. Total = 4
      // Current: Sprint 2: alice=1PW → remaining = 1
      const result = computePersonWeeks(data, baseSettings);
      expect(result).toEqual({ total: 4, remaining: 1, epicLevel: false });
    });
  });

  describe('epic-level (pwSource=epic)', () => {
    it('uses epic SP estimate directly (ceiling)', () => {
      const data = makeCachedData({ epicEstimate: { sp: 7.5, pd: null } });
      const result = computePersonWeeks(data, { ...baseSettings, pwSource: 'epic' });
      expect(result).toEqual({ total: 8, remaining: 8, epicLevel: true });
    });

    it('uses epic PD estimate / 5 (ceiling)', () => {
      const data = makeCachedData({ epicEstimate: { sp: null, pd: 12 } });
      const result = computePersonWeeks(data, { ...baseSettings, pwSource: 'epic' });
      // ceil(12/5) = 3
      expect(result).toEqual({ total: 3, remaining: 3, epicLevel: true });
    });

    it('returns 0 when epic has no estimate', () => {
      const data = makeCachedData();
      const result = computePersonWeeks(data, { ...baseSettings, pwSource: 'epic' });
      expect(result).toEqual({ total: 0, remaining: 0, epicLevel: true });
    });

    it('prefers SP over PD when both present and SP > 0', () => {
      const data = makeCachedData({ epicEstimate: { sp: 3, pd: 20 } });
      const result = computePersonWeeks(data, { ...baseSettings, pwSource: 'epic' });
      expect(result).toEqual({ total: 3, remaining: 3, epicLevel: true });
    });

    it('falls back to PD when SP is 0', () => {
      const data = makeCachedData({ epicEstimate: { sp: 0, pd: 10 } });
      const result = computePersonWeeks(data, { ...baseSettings, pwSource: 'epic' });
      // ceil(10/5) = 2
      expect(result).toEqual({ total: 2, remaining: 2, epicLevel: true });
    });
  });

  describe('epic-fallback (pwSource=epic-fallback)', () => {
    it('uses epic estimate when present', () => {
      const data = makeCachedData({ epicEstimate: { sp: 4, pd: null } });
      const result = computePersonWeeks(data, { ...baseSettings, pwSource: 'epic-fallback' });
      expect(result).toEqual({ total: 4, remaining: 4, epicLevel: true });
    });

    it('falls through to story-level when no epic estimate', () => {
      const data = makeCachedData({
        effortPerPersonPerSprint: makeEffortMap([
          ['Sprint 1', [['alice', { sp: 3, pd: 0 }]]],
        ]),
        effortPerPersonCurrentSprints: makeEffortMap([
          ['Sprint 1', [['alice', { sp: 3, pd: 0 }]]],
        ]),
      });
      const result = computePersonWeeks(data, { ...baseSettings, pwSource: 'epic-fallback' });
      expect(result).toEqual({ total: 1, remaining: 1, epicLevel: false });
    });
  });
});

// ===========================================================================
// buildPwOverride
// ===========================================================================
describe('buildPwOverride', () => {
  const pwSettings: PwSettings = {
    badgeDisplayMode: 'personweeks',
    spThresholdPerPw: 5,
    pdThresholdPerPw: 4,
    pwSource: 'stories',
  };

  it('returns undefined when display mode is not personweeks', () => {
    expect(buildPwOverride(makeCachedData(), { ...pwSettings, badgeDisplayMode: 'count' })).toBeUndefined();
    expect(buildPwOverride(makeCachedData(), { ...pwSettings, badgeDisplayMode: 'avatars' })).toBeUndefined();
  });

  describe('story-level display', () => {
    it('shows "X PW" when remaining equals total', () => {
      const data = makeCachedData({
        effortPerPersonPerSprint: makeEffortMap([
          ['Sprint 1', [['alice', { sp: 3, pd: 0 }]]],
        ]),
        effortPerPersonCurrentSprints: makeEffortMap([
          ['Sprint 1', [['alice', { sp: 3, pd: 0 }]]],
        ]),
        totalStoryCount: 2,
        estimatedStoryCount: 2,
      });
      const result = buildPwOverride(data, pwSettings);
      expect(result).toBeDefined();
      expect(result!.text).toBe('1 PW');
      expect(result!.tooltip).toContain('1 person-weeks remaining');
      expect(result!.tooltip).toContain('1 total');
    });

    it('shows "X PW left (Y total)" when remaining differs from total', () => {
      const data = makeCachedData({
        effortPerPersonPerSprint: makeEffortMap([
          ['Sprint 1', [['alice', { sp: 3, pd: 0 }]]],
          ['Sprint 2', [['bob', { sp: 5, pd: 0 }]]],
        ]),
        effortPerPersonCurrentSprints: makeEffortMap([
          ['Sprint 2', [['bob', { sp: 5, pd: 0 }]]],
        ]),
        totalStoryCount: 3,
        estimatedStoryCount: 3,
        totalCount: 2,
      });
      const result = buildPwOverride(data, pwSettings);
      expect(result).toBeDefined();
      expect(result!.text).toBe('1 PW left (2 total)');
    });

    it('includes estimation note when not all stories estimated', () => {
      const data = makeCachedData({
        effortPerPersonPerSprint: makeEffortMap([
          ['Sprint 1', [['alice', { sp: 3, pd: 0 }]]],
        ]),
        effortPerPersonCurrentSprints: makeEffortMap([
          ['Sprint 1', [['alice', { sp: 3, pd: 0 }]]],
        ]),
        totalStoryCount: 5,
        estimatedStoryCount: 3,
      });
      const result = buildPwOverride(data, pwSettings);
      expect(result!.text).toContain('3/5');
    });
  });

  describe('epic-level display', () => {
    it('shows epic estimate with SP source', () => {
      const data = makeCachedData({ epicEstimate: { sp: 10, pd: null } });
      const result = buildPwOverride(data, { ...pwSettings, pwSource: 'epic' });
      expect(result!.text).toBe('10 PW');
      expect(result!.tooltip).toContain('epic estimate: 10 SP');
    });

    it('shows epic estimate with PD source', () => {
      const data = makeCachedData({ epicEstimate: { sp: null, pd: 15 } });
      const result = buildPwOverride(data, { ...pwSettings, pwSource: 'epic' });
      expect(result!.text).toBe('3 PW');
      expect(result!.tooltip).toContain('epic estimate: 15 days');
    });

    it('handles no epic estimate gracefully', () => {
      const data = makeCachedData();
      const result = buildPwOverride(data, { ...pwSettings, pwSource: 'epic' });
      expect(result!.text).toBe('0 PW');
      expect(result!.tooltip).toContain('no estimate');
    });

    it('handles epic estimate with sp=0 and pd=null', () => {
      const data = makeCachedData({ epicEstimate: { sp: 0, pd: null } });
      const result = buildPwOverride(data, { ...pwSettings, pwSource: 'epic' });
      // sp=0 → falls to pd → ceil(0/5) = 0
      expect(result!.text).toBe('0 PW');
    });
  });
});

// ===========================================================================
// parseSprint
// ===========================================================================
describe('parseSprint', () => {
  it('parses standard Jira server sprint string', () => {
    const input = 'com.atlassian.greenhopper.service.sprint.Sprint@7f3c[id=209802,rapidViewId=45164,state=ACTIVE,name=Sprint 45,startDate=2024-01-15]';
    const result = parseSprint(input);
    expect(result).toEqual({ name: 'Sprint 45', state: 'ACTIVE' });
  });

  it('parses CLOSED sprint', () => {
    const input = 'com.atlassian.greenhopper.service.sprint.Sprint@abc[id=100,state=CLOSED,name=Sprint 44,goal=Fix bugs]';
    expect(parseSprint(input)).toEqual({ name: 'Sprint 44', state: 'CLOSED' });
  });

  it('parses FUTURE sprint', () => {
    const input = 'com.atlassian.greenhopper.service.sprint.Sprint@def[id=200,state=FUTURE,name=Sprint 46]';
    expect(parseSprint(input)).toEqual({ name: 'Sprint 46', state: 'FUTURE' });
  });

  it('returns null for non-string input', () => {
    expect(parseSprint(42 as any)).toBeNull();
    expect(parseSprint(null as any)).toBeNull();
    expect(parseSprint(undefined as any)).toBeNull();
  });

  it('returns null for string with no name field', () => {
    expect(parseSprint('some random string')).toBeNull();
    expect(parseSprint('[id=100,state=ACTIVE]')).toBeNull();
  });

  it('returns UNKNOWN state when state field is missing', () => {
    const input = '[name=Sprint X,id=1]';
    expect(parseSprint(input)).toEqual({ name: 'Sprint X', state: 'UNKNOWN' });
  });

  it('trims whitespace from name and state', () => {
    const input = '[state= ACTIVE ,name= Sprint 99 ]';
    expect(parseSprint(input)).toEqual({ name: 'Sprint 99', state: 'ACTIVE' });
  });

  it('handles name at end of bracket', () => {
    const input = '[id=1,state=CLOSED,name=Final Sprint]';
    expect(parseSprint(input)).toEqual({ name: 'Final Sprint', state: 'CLOSED' });
  });
});
