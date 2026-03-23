/**
 * Person-weeks computation logic for Jira Plans Enhanced
 *
 * Pure functions that compute person-week (PW) values from cached effort data.
 * All functions accept their dependencies as parameters rather than reading module-level state.
 *
 * @module content/person-weeks
 */

import type { CachedAssigneeData, PersonEffort } from './cache';

export type { PersonEffort };

/**
 * Settings required by person-weeks computation functions.
 */
export interface PwSettings {
  badgeDisplayMode: 'count' | 'avatars' | 'personweeks';
  spThresholdPerPw: number;
  pdThresholdPerPw: number;
  pwSource: 'stories' | 'epic' | 'epic-fallback';
}

/**
 * Convert a single effort value to person-weeks using the appropriate threshold.
 *
 * - SP uses spThresholdPerPw, person-days uses pdThresholdPerPw
 * - effort <= threshold  =>  1 PW
 * - effort >  threshold  =>  2 PW
 * - no effort (null/undefined/<=0)  =>  0 PW
 */
export function effortToPersonWeeks(
  effort: number | null | undefined,
  unit: 'sp' | 'pd',
  spThresholdPerPw: number,
  pdThresholdPerPw: number,
): number {
  if (!effort || effort <= 0) return 0;
  const threshold = unit === 'pd' ? pdThresholdPerPw : spThresholdPerPw;
  return effort <= threshold ? 1 : 2;
}

/**
 * Convert a PersonEffort to PW.
 *
 * Uses whichever field is populated (SP preferred over PD).
 * A person can contribute at most 2 PW per sprint regardless of mixed sources.
 */
export function personEffortToPw(
  effort: PersonEffort,
  spThresholdPerPw: number,
  pdThresholdPerPw: number,
): number {
  const spPw = effortToPersonWeeks(effort.sp, 'sp', spThresholdPerPw, pdThresholdPerPw);
  const pdPw = effortToPersonWeeks(effort.pd, 'pd', spThresholdPerPw, pdThresholdPerPw);
  return Math.min(Math.max(spPw, pdPw), 2);
}

/**
 * Compute person-weeks from cached per-person-per-sprint effort data.
 *
 * Returns total PW (all sprints) and remaining PW (active/future only).
 * Uses provided threshold settings so changes are reflected immediately.
 */
export function computePersonWeeks(
  cachedData: CachedAssigneeData,
  settings: Pick<PwSettings, 'pwSource' | 'spThresholdPerPw' | 'pdThresholdPerPw'>,
): { total: number; remaining: number; epicLevel: boolean } {
  const { pwSource, spThresholdPerPw, pdThresholdPerPw } = settings;

  // Epic-level PW: epic's own SP/days used as PW (1 SP = 1 PW, 5 days = 1 PW)
  if (pwSource !== 'stories' && cachedData.epicEstimate) {
    // 'epic' = always use epic estimate; 'epic-fallback' = use epic if present, else fall through
    const epicPw = (cachedData.epicEstimate.sp && cachedData.epicEstimate.sp > 0)
      ? Math.ceil(cachedData.epicEstimate.sp)
      : Math.ceil((cachedData.epicEstimate.pd || 0) / 5);
    return { total: epicPw, remaining: epicPw, epicLevel: true };
  }
  if (pwSource === 'epic' && !cachedData.epicEstimate) {
    // Epic mode but no estimate on the epic -- show 0
    return { total: 0, remaining: 0, epicLevel: true };
  }

  // Story-level PW: aggregate per-person-per-sprint effort
  let total = 0;
  for (const effortPerPerson of cachedData.effortPerPersonPerSprint.values()) {
    for (const effort of effortPerPerson.values()) {
      total += personEffortToPw(effort, spThresholdPerPw, pdThresholdPerPw);
    }
  }
  let remaining = 0;
  for (const effortPerPerson of cachedData.effortPerPersonCurrentSprints.values()) {
    for (const effort of effortPerPerson.values()) {
      remaining += personEffortToPw(effort, spThresholdPerPw, pdThresholdPerPw);
    }
  }
  return { total, remaining, epicLevel: false };
}

/**
 * Build display override for PW mode badges.
 *
 * Shows "X PW" when remaining == total, or "X PW left (Y total)" otherwise.
 * Returns undefined when badge display mode is not 'personweeks'.
 */
export function buildPwOverride(
  cachedData: CachedAssigneeData,
  settings: PwSettings,
): { text: string; tooltip: string } | undefined {
  if (settings.badgeDisplayMode !== 'personweeks') return undefined;

  const { total, remaining, epicLevel } = computePersonWeeks(cachedData, settings);

  if (epicLevel) {
    // Epic-level PW: show direct estimate with source indicator
    const est = cachedData.epicEstimate;
    const source = est
      ? ((est.sp && est.sp > 0) ? `${est.sp} SP` : `${est.pd} days`)
      : 'no estimate';
    const text = `${total} PW`;
    const tooltip = `${total} person-weeks (epic estimate: ${source})`;
    return { text, tooltip };
  }

  const { estimatedStoryCount, totalStoryCount, totalCount } = cachedData;
  const allEstimated = estimatedStoryCount >= totalStoryCount;
  const estimationNote = allEstimated ? '' : `, ${estimatedStoryCount}/${totalStoryCount}`;

  let text: string;
  if (remaining === total) {
    // No completed sprints -- just show total
    text = `${total} PW${estimationNote ? ` (${estimatedStoryCount}/${totalStoryCount})` : ''}`;
  } else {
    text = `${remaining} PW left (${total} total${estimationNote})`;
  }

  const tooltip = `${remaining} person-weeks remaining, ${total} total (${totalCount} engineers, ${totalStoryCount} stories${allEstimated ? '' : `, ${estimatedStoryCount} estimated`})`;
  return { text, tooltip };
}

/**
 * Parse sprint name and state from Jira's sprint field format.
 *
 * Expected format:
 *   "com.atlassian.greenhopper.service.sprint.Sprint@hash[id=209802,rapidViewId=45164,state=ACTIVE,name=Sprint 45,...]"
 *
 * Returns null if the string cannot be parsed.
 */
export function parseSprint(sprintStr: string): { name: string; state: string } | null {
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
