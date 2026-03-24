/**
 * Badge UI Component
 *
 * Creates and manages headcount badges displayed:
 * 1. Next to epic titles in the left panel
 * 2. On the timeline bars in the right panel
 */

import { AssigneeInfo } from '../shared/types';
import { createAvatarBadge } from './avatar-badge';
import { STYLES } from './badge-styles';
import { findTimelineBar } from './dom-parser';

export const BADGE_CLASS = 'jira-plans-headcount-badge';
export const TIMELINE_BADGE_CLASS = 'jira-plans-timeline-badge';
export const STORY_AVATAR_CLASS = 'jira-plans-story-avatar';

/** Adaptive font size for timeline badges — scales down for longer text */
function timelineBadgeFontSize(text: string): string {
  const len = text.length;
  if (len <= 4) return '10px';
  if (len <= 10) return '9px';
  return '8px';
}

/**
 * Count all badges currently in the DOM
 */
export function countBadges(): { leftPanel: number; timeline: number; sprint: number; total: number } {
  const leftPanelBadges = document.querySelectorAll(`.${BADGE_CLASS}`).length;
  const timelineBadges = document.querySelectorAll(`.${TIMELINE_BADGE_CLASS}`).length;

  // Sprint badges are timeline badges with data-sprint attribute
  const sprintBadges = document.querySelectorAll(`.${TIMELINE_BADGE_CLASS}[data-sprint]`).length;

  return {
    leftPanel: leftPanelBadges,
    timeline: timelineBadges - sprintBadges, // Timeline badges without sprint data
    sprint: sprintBadges,
    total: leftPanelBadges + timelineBadges,
  };
}

/**
 * Clear all badges from the DOM
 */
export function clearAllBadges(): number {
  const allBadges = document.querySelectorAll(`.${BADGE_CLASS}, .${TIMELINE_BADGE_CLASS}, .${STORY_AVATAR_CLASS}`);
  const count = allBadges.length;
  allBadges.forEach(badge => badge.remove());
  return count;
}

/**
 * Create a badge element with the specified count
 * Use count = -1 for loading state
 */
export function createBadge(count: number, isExpanded: boolean, epicKey?: string, displayOverride?: { text: string; tooltip: string }): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = BADGE_CLASS;

  // Add data attribute to track which epic this badge belongs to
  if (epicKey) {
    badge.setAttribute('data-epic-key', epicKey);
  }

  // Add data attribute to track if this is a zero-count badge
  if (count === 0) {
    badge.setAttribute('data-zero-count', 'true');
  }

  if (displayOverride) {
    badge.textContent = displayOverride.text;
    badge.title = displayOverride.tooltip;
  } else if (count === -1) {
    // Loading state
    badge.textContent = '... 👥';
    badge.title = 'Loading assignee count...';
  } else if (count === 0) {
    badge.textContent = '0 👥';
    badge.title = 'No assignees found for this epic';
  } else {
    badge.textContent = `${count} 👥`;
    badge.title = `${count} unique ${count === 1 ? 'engineer' : 'engineers'} working on this epic`;
  }

  // Styling applied via CSS class from badge-styles.ts
  badge.classList.add(STYLES.badge);

  return badge;
}

/**
 * Inject a badge BEFORE the epic key element (as a sibling of its parent)
 * Returns true if injection was successful, false otherwise
 *
 * Using stable selector: a[href*="/browse/"] for epic key link
 * Badge is placed BEFORE the epic key's parent container
 */
export function injectBadge(epicRow: HTMLElement, count: number, isExpanded: boolean, epicKey?: string, displayOverride?: { text: string; tooltip: string }): boolean {
  // Extract epic key from link if not provided
  if (!epicKey) {
    const epicKeyElement = epicRow.querySelector('a[href*="/browse/"]');
    if (epicKeyElement) {
      epicKey = epicKeyElement.textContent?.trim() || '';
    }
  }

  // Check if badge already exists for this epic key
  if (epicKey) {
    const existingBadge = document.querySelector(`.${BADGE_CLASS}[data-epic-key="${epicKey}"]`);
    if (existingBadge) {
      return false;
    }
  }

  // Find epic key link by href pattern
  const epicKeyElement = epicRow.querySelector('a[href*="/browse/"]') as HTMLElement;
  if (!epicKeyElement) {
    return false;
  }

  // Get the parent container of the epic key link
  const parentContainer = epicKeyElement.parentElement;
  if (!parentContainer) {
    return false;
  }

  const badge = createBadge(count, isExpanded, epicKey, displayOverride);

  // Insert badge BEFORE the parent container (as a sibling)
  parentContainer.insertAdjacentElement('beforebegin', badge);

  return true;
}

/**
 * Update an existing badge with new count
 * Returns true if update was successful, false if badge doesn't exist
 */
export function updateBadge(epicRow: HTMLElement, count: number, isExpanded: boolean, epicKey?: string, displayOverride?: { text: string; tooltip: string }): boolean {
  // Try to find badge by epic key first
  let badge: HTMLSpanElement | null = null;

  if (epicKey) {
    badge = document.querySelector(`.${BADGE_CLASS}[data-epic-key="${epicKey}"]`) as HTMLSpanElement;
  }

  // Fallback to searching within epic row
  if (!badge) {
    badge = epicRow.querySelector(`.${BADGE_CLASS}`) as HTMLSpanElement;
  }

  if (!badge) {
    return false;
  }

  if (displayOverride) {
    badge.textContent = displayOverride.text;
    badge.title = displayOverride.tooltip;
  } else if (count === -1) {
    // Loading state
    badge.textContent = '... 👥';
    badge.title = 'Loading assignee count...';
  } else if (count === 0) {
    badge.textContent = '0 👥';
    badge.title = 'No assignees found for this epic';
  } else {
    badge.textContent = `${count} 👥`;
    badge.title = `${count} unique ${count === 1 ? 'engineer' : 'engineers'} working on this epic`;
  }

  return true;
}

/**
 * Remove a badge from an epic row
 * Returns true if removal was successful, false if badge doesn't exist
 */
export function removeBadge(epicRow: HTMLElement, epicKey?: string): boolean {
  let badge: Element | null = null;

  // Try to find badge by epic key first
  if (epicKey) {
    badge = document.querySelector(`.${BADGE_CLASS}[data-epic-key="${epicKey}"]`);
  }

  // Fallback to searching within epic row
  if (!badge) {
    badge = epicRow.querySelector(`.${BADGE_CLASS}`);
  }

  if (!badge) {
    return false;
  }

  badge.remove();
  return true;
}

/**
 * Create a timeline badge for display on the timeline bar
 * Styled differently to be visible on the blue bar background
 * Uses position: absolute with no parent modification (relies on bar already having positioning)
 */
export function createTimelineBadge(
  count: number,
  assignees?: AssigneeInfo[],
  displayMode: 'count' | 'avatars' | 'personweeks' = 'count',
  avatarOptions?: { maxVisible?: number }
): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = TIMELINE_BADGE_CLASS;

  // Add data attribute to track if this is a zero-count badge
  if (count === 0) {
    badge.setAttribute('data-zero-count', 'true');
  }

  // Handle loading and zero states (always show as numeric)
  if (count === -1 || count === 0) {
    if (count === -1) {
      badge.textContent = '...';
      badge.title = 'Loading assignee count...';
    } else {
      badge.textContent = '0';
      badge.title = 'No assignees';
    }

    // Base styling via CSS class
    badge.classList.add(STYLES.timelineBadge);

    return badge;
  }

  const maxVisible = avatarOptions?.maxVisible || 4;

  // Create badge content based on display mode
  if (displayMode === 'avatars' && assignees && assignees.length > 0) {
    // Avatar mode: show profile pictures
    const avatarBadge = createAvatarBadge(assignees, {
      maxVisible,
      size: 16,
      overlap: 6,
      showTooltip: true,
    });

    badge.classList.add(STYLES.timelineBadge, STYLES.timelineBadgeAvatars);

    badge.appendChild(avatarBadge);
  } else {
    // Count mode (default): show numeric badge
    const text = `${count}`;
    badge.textContent = text;
    const engineersText = `${count} unique ${count === 1 ? 'engineer' : 'engineers'}`;

    if (assignees && assignees.length > 0) {
      const assigneesList = assignees.map(a => a.displayName).join(', ');
      badge.title = `Total: ${engineersText}\n\nEngineers: ${assigneesList}`;
    } else {
      badge.title = `Total: ${engineersText}`;
    }

    badge.classList.add(STYLES.timelineBadge);
    // Dynamic font-size override based on text length
    badge.style.fontSize = timelineBadgeFontSize(text);
  }

  return badge;
}

/**
 * Inject a badge on the timeline bar
 * Timeline bars are found by data-name="issue-bar-{issueId}"
 *
 * COVERAGE NOTE: Partially excluded - Timeline positioning with absolute CSS.
 * Testing requires mocking window.getComputedStyle and getBoundingClientRect
 * with realistic pixel values. Better validated through visual testing.
 */
/* istanbul ignore next */
export function injectTimelineBadge(
  issueId: string,
  count: number,
  assignees?: AssigneeInfo[],
  displayMode: 'count' | 'avatars' | 'personweeks' = 'count',
  avatarOptions?: { maxVisible?: number; size?: number }
): boolean {
  const timelineBar = findTimelineBar(issueId);

  if (!timelineBar) {
    return false;
  }

  // Check if badge already exists
  if (timelineBar.querySelector(`.${TIMELINE_BADGE_CLASS}`)) {
    return false;
  }

  // Ensure bar has position context for absolute badge positioning
  const computedPosition = window.getComputedStyle(timelineBar).position;
  if (computedPosition === 'static') {
    timelineBar.style.position = 'relative';
  }

  const badge = createTimelineBadge(count, assignees, displayMode, avatarOptions);
  timelineBar.appendChild(badge);

  return true;
}

/**
 * Update an existing timeline badge
 */
export function updateTimelineBadge(issueId: string, count: number, assignees?: AssigneeInfo[]): boolean {
  const timelineBar = findTimelineBar(issueId);

  if (!timelineBar) {
    return false;
  }

  const badge = timelineBar.querySelector(`.${TIMELINE_BADGE_CLASS}`) as HTMLSpanElement;
  if (!badge) {
    return false;
  }

  if (count === -1) {
    badge.textContent = '...';
    badge.title = 'Loading assignee count...';
  } else if (count === 0) {
    badge.textContent = '0';
    badge.title = 'No assignees';
  } else {
    badge.textContent = `${count}`;
    const engineersText = `${count} unique ${count === 1 ? 'engineer' : 'engineers'}`;

    if (assignees && assignees.length > 0) {
      // Include engineer names in tooltip
      const assigneesList = assignees.join(', ');
      badge.title = `Total: ${engineersText}\n\nEngineers: ${assigneesList}`;
    } else {
      badge.title = `Total: ${engineersText}`;
    }
  }

  return true;
}

/**
 * Create a sprint-specific timeline badge
 * @param count - Number of engineers in this sprint
 * @param sprintName - Sprint name for tooltip
 * @param positionPercent - Position as percentage of bar width (0-100)
 */
export function createSprintBadge(
  count: number,
  sprintName: string,
  positionPercent: number,
  unscheduledStories?: string[],
  assignees?: AssigneeInfo[],
  displayMode: 'count' | 'avatars' | 'personweeks' = 'count',
  avatarOptions?: { maxVisible?: number }
): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = TIMELINE_BADGE_CLASS;
  badge.setAttribute('data-sprint', sprintName);

  // Add data attribute to track if this is a zero-count badge
  if (count === 0) {
    badge.setAttribute('data-zero-count', 'true');
  }

  // Check if this is the special "no sprint" badge
  const isNoSprint = sprintName === '__NO_SPRINT__';

  //  Handle loading and zero states (always show as numeric)
  if (count === -1 || count === 0) {
    if (count === -1) {
      badge.textContent = '...';
      badge.title = isNoSprint ? 'Stories not assigned to sprints: Loading...' : `${sprintName}: Loading...`;
    } else {
      badge.textContent = isNoSprint ? '⚠ 0' : '0';
      badge.title = isNoSprint ? 'Stories not assigned to sprints: No assignees' : `${sprintName}: No assignees`;
    }

    badge.classList.add(STYLES.timelineBadge);
    if (isNoSprint) {
      badge.classList.add(STYLES.timelineBadgeWarning);
    }
    // Dynamic position override
    badge.style.left = `${positionPercent}%`;

    return badge;
  }

  const maxVisible = avatarOptions?.maxVisible || 4;
  const engineersText = `${count} unique ${count === 1 ? 'engineer' : 'engineers'}`;

  // Build tooltip text
  let tooltipText = '';
  if (isNoSprint && unscheduledStories && unscheduledStories.length > 0) {
    const storiesList = unscheduledStories.join(', ');
    const assigneesList = assignees && assignees.length > 0 ? `\n\nEngineers: ${assignees.map(a => a.displayName).join(', ')}` : '';
    tooltipText = `⚠ Stories not assigned to sprints: ${engineersText}${assigneesList}\n\nUnscheduled stories: ${storiesList}`;
  } else if (assignees && assignees.length > 0) {
    const assigneesList = assignees.map(a => a.displayName).join(', ');
    tooltipText = isNoSprint
      ? `⚠ Stories not assigned to sprints: ${engineersText}\n\nEngineers: ${assigneesList}`
      : `${sprintName}: ${engineersText}\n\nEngineers: ${assigneesList}`;
  } else {
    tooltipText = isNoSprint ? `⚠ Stories not assigned to sprints: ${engineersText}` : `${sprintName}: ${engineersText}`;
  }

  // Create badge content based on display mode (but always show warning badges as count+icon)
  if (!isNoSprint && displayMode === 'avatars' && assignees && assignees.length > 0) {
    // Avatar mode: show profile pictures
    const avatarBadge = createAvatarBadge(assignees, {
      maxVisible,
      size: 16,
      overlap: 6,
      showTooltip: false,
    });

    badge.classList.add(STYLES.timelineBadge, STYLES.timelineBadgeAvatars);
    // Dynamic position override
    badge.style.left = `${positionPercent}%`;

    badge.appendChild(avatarBadge);
    badge.title = tooltipText;
  } else {
    // Count mode (default) or warning badge: show numeric badge
    const text = isNoSprint ? `⚠ ${count}` : `${count}`;
    badge.textContent = text;
    badge.title = tooltipText;

    badge.classList.add(STYLES.timelineBadge);
    if (isNoSprint) {
      badge.classList.add(STYLES.timelineBadgeWarning);
    }
    // Dynamic overrides: position and adaptive font-size
    badge.style.left = `${positionPercent}%`;
    badge.style.fontSize = timelineBadgeFontSize(text);
  }

  return badge;
}

/**
 * Clear all timeline badges from a bar
 */
export function clearTimelineBadges(issueId: string): void {
  const timelineBar = findTimelineBar(issueId);

  if (!timelineBar) {
    return;
  }

  const badges = timelineBar.querySelectorAll(`.${TIMELINE_BADGE_CLASS}`);
  badges.forEach(badge => badge.remove());
}

/**
 * Inject multiple sprint-specific badges on the timeline bar
 * @param issueId - Jira issue ID
 * @param sprintData - Array of {sprintName, count, positionPercent, assignees}
 * @param unscheduledStories - Array of story keys not assigned to sprints (for tooltip)
 *
 * COVERAGE NOTE: Partially excluded - Complex sprint badge positioning logic.
 * Testing requires mocking sprint layout calculations, overlapping sprints,
 * and getBoundingClientRect. Better validated through visual testing with real sprint data.
 */
/* istanbul ignore next */
export function injectSprintBadges(
  issueId: string,
  sprintData: Array<{ sprintName: string; count: number; positionPercent: number; assignees: AssigneeInfo[] }>,
  unscheduledStories?: string[],
  displayMode: 'count' | 'avatars' | 'personweeks' = 'count',
  avatarOptions?: { maxVisible?: number }
): boolean {
  const timelineBar = findTimelineBar(issueId);

  if (!timelineBar) {
    return false;
  }

  // Clear existing badges first
  clearTimelineBadges(issueId);

  // Ensure bar has position context for absolute badge positioning
  const computedPosition = window.getComputedStyle(timelineBar).position;
  if (computedPosition === 'static') {
    timelineBar.style.position = 'relative';
  }

  // Add new badges for each sprint
  for (const { sprintName, count, positionPercent, assignees } of sprintData) {
    const badge = createSprintBadge(count, sprintName, positionPercent, unscheduledStories, assignees, displayMode, avatarOptions);
    timelineBar.appendChild(badge);
  }

  return true;
}

/**
 * Inject a single assignee avatar onto a story's timeline bar
 *
 * Places a circular avatar badge centered on the story's timeline bar.
 * If no avatar URL is available, falls back to colored initials.
 */
export function injectStoryAvatar(issueId: string, assignee: AssigneeInfo): boolean {
  const timelineBar = findTimelineBar(issueId);

  if (!timelineBar) {
    return false;
  }

  // Don't inject if already present
  if (timelineBar.querySelector(`.${STORY_AVATAR_CLASS}`)) {
    return false;
  }

  // Ensure bar has position context
  const computedPosition = window.getComputedStyle(timelineBar).position;
  if (computedPosition === 'static') {
    timelineBar.style.position = 'relative';
  }

  const avatarBadge = createAvatarBadge([assignee], {
    maxVisible: 1,
    size: 16,
    overlap: 0,
    showTooltip: true,
  });

  // Wrap in a positioned container
  const wrapper = document.createElement('div');
  wrapper.className = STORY_AVATAR_CLASS;
  wrapper.classList.add(STYLES.storyAvatar);
  wrapper.setAttribute('data-issue-id', issueId);
  wrapper.appendChild(avatarBadge);

  timelineBar.appendChild(wrapper);
  return true;
}

/**
 * Inject a person-weeks badge onto a story's timeline bar
 *
 * Shows "X SP (Y PW)" or "Xd (Y PW)" for estimated stories.
 * Shows "⚠ No estimate" in orange for stories without effort data.
 */
export function injectStoryPwBadge(issueId: string, detail: { effort: number; effortUnit: 'sp' | 'pd'; personPw: number } | null): boolean {
  const timelineBar = findTimelineBar(issueId);

  if (!timelineBar) {
    return false;
  }

  // Don't inject if already present
  if (timelineBar.querySelector(`.${STORY_AVATAR_CLASS}`)) {
    return false;
  }

  // Ensure bar has position context
  const computedPosition = window.getComputedStyle(timelineBar).position;
  if (computedPosition === 'static') {
    timelineBar.style.position = 'relative';
  }

  const isUnestimated = detail === null;
  const wrapper = document.createElement('div');
  wrapper.className = STORY_AVATAR_CLASS;
  wrapper.setAttribute('data-issue-id', issueId);

  const badge = document.createElement('span');
  if (isUnestimated) {
    badge.textContent = '⚠ No estimate';
    badge.title = 'This story has no story points or time estimate';
  } else {
    const effortLabel = detail.effortUnit === 'pd'
      ? `${detail.effort % 1 === 0 ? detail.effort : detail.effort.toFixed(1)}d`
      : `${detail.effort} SP`;
    const effortDesc = detail.effortUnit === 'pd' ? 'person-days' : 'story points';
    badge.textContent = `${detail.personPw} PW`;
    badge.title = `${detail.personPw} PW (${effortLabel} — ${detail.effort} ${effortDesc})`;
  }

  // Base styling via CSS classes; dynamic font-size/padding overrides below
  badge.classList.add(STYLES.timelineBadge);
  badge.classList.add(isUnestimated ? STYLES.storyPwUnestimated : STYLES.storyPwEstimated);

  const barWidth = timelineBar.getBoundingClientRect().width;
  const textLen = badge.textContent?.length || 0;
  // ~6px per char at 9px font — scale down if badge would exceed bar width
  const estimatedBadgeWidth = textLen * 6;
  let fontSize = 9;
  if (barWidth > 0 && estimatedBadgeWidth > barWidth) {
    fontSize = Math.max(6, Math.floor(9 * barWidth / estimatedBadgeWidth));
  }
  // Dynamic overrides that depend on runtime measurements
  badge.style.fontSize = `${fontSize}px`;
  badge.style.padding = `1px ${fontSize >= 8 ? 5 : 3}px`;

  wrapper.classList.add(STYLES.storyAvatar);
  // PW wrapper uses flex layout and disables pointer-events on wrapper (enabled on badge)
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.pointerEvents = 'none';

  badge.style.pointerEvents = 'auto';

  wrapper.appendChild(badge);
  timelineBar.appendChild(wrapper);
  return true;
}

/**
 * Clear all story avatar/PW badges from the DOM
 */
export function clearAllStoryAvatars(): number {
  const allAvatars = document.querySelectorAll(`.${STORY_AVATAR_CLASS}`);
  const count = allAvatars.length;
  allAvatars.forEach(avatar => avatar.remove());
  return count;
}
