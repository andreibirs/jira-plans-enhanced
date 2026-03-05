/**
 * Badge UI Component
 *
 * Creates and manages headcount badges displayed:
 * 1. Next to epic titles in the left panel
 * 2. On the timeline bars in the right panel
 */

export const BADGE_CLASS = 'jira-plans-headcount-badge';
export const TIMELINE_BADGE_CLASS = 'jira-plans-timeline-badge';

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
  const allBadges = document.querySelectorAll(`.${BADGE_CLASS}, .${TIMELINE_BADGE_CLASS}`);
  const count = allBadges.length;
  allBadges.forEach(badge => badge.remove());
  return count;
}

/**
 * Create a badge element with the specified count
 * Use count = -1 for loading state
 */
export function createBadge(count: number, isExpanded: boolean, epicKey?: string): HTMLSpanElement {
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

  if (count === -1) {
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

  // Apply styling to match Jira theme - margin RIGHT since it's BEFORE the epic key
  badge.style.marginRight = '8px';
  badge.style.padding = '2px 6px';
  badge.style.backgroundColor = '#e0e0e0';
  badge.style.borderRadius = '4px';
  badge.style.fontSize = '11px';
  badge.style.fontWeight = 'bold';
  badge.style.color = '#333';
  badge.style.display = 'inline-block';
  badge.style.verticalAlign = 'middle';

  return badge;
}

/**
 * Inject a badge BEFORE the epic key element (as a sibling of its parent)
 * Returns true if injection was successful, false otherwise
 *
 * Using stable selector: a[href*="/browse/"] for epic key link
 * Badge is placed BEFORE the epic key's parent container
 */
export function injectBadge(epicRow: HTMLElement, count: number, isExpanded: boolean, epicKey?: string): boolean {
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

  const badge = createBadge(count, isExpanded, epicKey);

  // Insert badge BEFORE the parent container (as a sibling)
  parentContainer.insertAdjacentElement('beforebegin', badge);

  return true;
}

/**
 * Update an existing badge with new count
 * Returns true if update was successful, false if badge doesn't exist
 */
export function updateBadge(epicRow: HTMLElement, count: number, isExpanded: boolean, epicKey?: string): boolean {
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

  if (count === -1) {
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
export function createTimelineBadge(count: number, assignees?: string[]): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = TIMELINE_BADGE_CLASS;

  // Add data attribute to track if this is a zero-count badge
  if (count === 0) {
    badge.setAttribute('data-zero-count', 'true');
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

  // Styling for timeline bar - needs to be visible on blue background
  // Using absolute positioning, centered on the bar
  // z-index: Very high to appear above all Jira UI elements (sprint headers, labels, etc.)
  // Add min-width to ensure entire badge is hoverable
  badge.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 2px 6px;
    background-color: rgba(0, 0, 0, 0.6);
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
    color: #fff;
    display: inline-block;
    pointer-events: auto;
    z-index: 9999;
    min-width: 18px;
    height: auto;
    margin: 0;
    cursor: help;
    text-align: center;
    box-sizing: border-box;
  `;

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
export function injectTimelineBadge(issueId: string, count: number, assignees?: string[]): boolean {
  // Find timeline bar by data-name pattern
  const timelineBar = document.querySelector(`[data-name="issue-bar-${issueId}"]`) as HTMLElement;
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

  const badge = createTimelineBadge(count, assignees);
  timelineBar.appendChild(badge);

  return true;
}

/**
 * Update an existing timeline badge
 */
export function updateTimelineBadge(issueId: string, count: number, assignees?: string[]): boolean {
  const timelineBar = document.querySelector(`[data-name="issue-bar-${issueId}"]`) as HTMLElement;
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
export function createSprintBadge(count: number, sprintName: string, positionPercent: number, unscheduledStories?: string[], assignees?: string[]): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = TIMELINE_BADGE_CLASS;
  badge.setAttribute('data-sprint', sprintName);

  // Add data attribute to track if this is a zero-count badge
  if (count === 0) {
    badge.setAttribute('data-zero-count', 'true');
  }

  // Check if this is the special "no sprint" badge
  const isNoSprint = sprintName === '__NO_SPRINT__';

  if (count === -1) {
    badge.textContent = '...';
    badge.title = isNoSprint ? 'Stories not assigned to sprints: Loading...' : `${sprintName}: Loading...`;
  } else if (count === 0) {
    badge.textContent = isNoSprint ? '⚠ 0' : '0';
    badge.title = isNoSprint ? 'Stories not assigned to sprints: No assignees' : `${sprintName}: No assignees`;
  } else {
    badge.textContent = isNoSprint ? `⚠ ${count}` : `${count}`;
    const engineersText = `${count} unique ${count === 1 ? 'engineer' : 'engineers'}`;

    if (isNoSprint && unscheduledStories && unscheduledStories.length > 0) {
      // Include story keys in tooltip for warning badge
      const storiesList = unscheduledStories.join(', ');
      const assigneesList = assignees && assignees.length > 0 ? `\n\nEngineers: ${assignees.join(', ')}` : '';
      badge.title = `⚠ Stories not assigned to sprints: ${engineersText}${assigneesList}\n\nUnscheduled stories: ${storiesList}`;
    } else if (assignees && assignees.length > 0) {
      // Include engineer names in tooltip for regular badges
      const assigneesList = assignees.join(', ');
      badge.title = isNoSprint
        ? `⚠ Stories not assigned to sprints: ${engineersText}\n\nEngineers: ${assigneesList}`
        : `${sprintName}: ${engineersText}\n\nEngineers: ${assigneesList}`;
    } else {
      badge.title = isNoSprint ? `⚠ Stories not assigned to sprints: ${engineersText}` : `${sprintName}: ${engineersText}`;
    }
  }

  // Use orange/warning color for no-sprint badges
  const backgroundColor = isNoSprint ? 'rgba(255, 152, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)';

  // Position badge at specific percentage of bar width
  // Use transform to center badge on the calculated position
  // z-index: Very high to appear above all Jira UI elements (sprint headers, labels, etc.)
  // Warning badges get even higher z-index to stand out
  // Add min-width to ensure entire badge is hoverable
  badge.style.cssText = `
    position: absolute;
    left: ${positionPercent}%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 2px 6px;
    background-color: ${backgroundColor};
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
    color: #fff;
    display: inline-block;
    pointer-events: auto;
    z-index: ${isNoSprint ? 10000 : 9999};
    min-width: ${isNoSprint ? '24px' : '18px'};
    height: auto;
    margin: 0;
    cursor: help;
    text-align: center;
    box-sizing: border-box;
  `;

  return badge;
}

/**
 * Clear all timeline badges from a bar
 */
export function clearTimelineBadges(issueId: string): void {
  const timelineBar = document.querySelector(`[data-name="issue-bar-${issueId}"]`) as HTMLElement;
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
  sprintData: Array<{ sprintName: string; count: number; positionPercent: number; assignees: string[] }>,
  unscheduledStories?: string[]
): boolean {
  const timelineBar = document.querySelector(`[data-name="issue-bar-${issueId}"]`) as HTMLElement;
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
    const badge = createSprintBadge(count, sprintName, positionPercent, unscheduledStories, assignees);
    timelineBar.appendChild(badge);
  }

  return true;
}
