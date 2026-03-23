/**
 * DOM Parser for Jira Plans
 *
 * Extracts epic and assignee data from the real Jira Plans page DOM structure
 *
 * Real Jira Plans Structure:
 * - Epic rows: <div data-issue="18794394" data-name="scope-issue-18794394">
 * - Epic key: <a class="_3HCO4" href="/browse/PROJ-123">PROJ-123</a>
 * - Epic title: <div class="_1hfWN">[Canvas Edit] Logo Swap...</div>
 * - Assignee cells (separate): <div data-issue="18794394" data-name="cell-18794394">
 * - Assignee name: <span class="_2v7GN">Alice Smith</span>
 */

export interface AssigneeData {
  count: number;
  isExpanded: boolean;
  uniqueUsers: string[];
}

export interface EpicData {
  epicKey: string;
  title: string;
  assigneeCount: number;
  isExpanded: boolean;
  element: HTMLElement;
}

/**
 * Check if a row matches a specific issue type by avatarId.
 * Supports both Server/DC format (avatarId= in query params) and
 * Cloud format (/avatar/{id} in path).
 */
function isIssueTypeRow(row: HTMLElement, avatarId: string): boolean {
  const iconElement = row.querySelector('[style*="avatarId"], [style*="/avatar/"]') as HTMLElement;
  if (!iconElement) {
    return false;
  }

  const backgroundImage = iconElement.style.backgroundImage;
  return backgroundImage.includes(`avatarId=${avatarId}`) || backgroundImage.includes(`/avatar/${avatarId}`);
}

/**
 * Find all epic rows in the current Jira Plans view
 *
 * Epic rows are identified by:
 * - data-issue attribute (contains issue ID)
 * - data-name attribute starting with "scope-issue-"
 * - Issue type icon with the epic avatar ID
 *
 * @param epicAvatarId - Avatar ID for epics (auto-detected or default '18807')
 */
export function findEpicRows(epicAvatarId: string = '18807'): HTMLElement[] {
  const allRows = document.querySelectorAll('[data-issue][data-name^="scope-issue-"]');
  const epicRows = Array.from(allRows).filter(row => isIssueTypeRow(row as HTMLElement, epicAvatarId));
  return epicRows as HTMLElement[];
}

/**
 * Find all story rows in the current Jira Plans view
 *
 * Story rows are identified by:
 * - data-issue attribute (contains issue ID)
 * - data-name attribute starting with "scope-issue-"
 * - Issue type icon with the story avatar ID
 *
 * @param storyAvatarId - Avatar ID for stories (auto-detected or default '18815')
 */
export function findStoryRows(storyAvatarId: string = '18815'): HTMLElement[] {
  const allRows = document.querySelectorAll('[data-issue][data-name^="scope-issue-"]');
  const storyRows = Array.from(allRows).filter(row => isIssueTypeRow(row as HTMLElement, storyAvatarId));
  return storyRows as HTMLElement[];
}

/**
 * Find the timeline bar element for a given issue ID
 *
 * Searches for the bar using two strategies:
 * 1. Direct match via data-name="issue-bar-{issueId}"
 * 2. Fallback: find rows with data-issue="{issueId}" (excluding scope-issue rows)
 *    and look for a child element with data-name starting with "issue-bar-"
 */
export function findTimelineBar(issueId: string): HTMLElement | null {
  let timelineBar = document.querySelector(`[data-name="issue-bar-${issueId}"]`) as HTMLElement;
  if (!timelineBar) {
    const allRows = document.querySelectorAll(`[data-issue="${issueId}"]`);
    for (const row of allRows) {
      const dataName = row.getAttribute('data-name');
      if (dataName && dataName.startsWith('scope-issue-')) {
        continue;
      }
      timelineBar = row.querySelector('[data-name^="issue-bar-"]') as HTMLElement;
      if (timelineBar) {
        break;
      }
    }
  }
  return timelineBar;
}

/**
 * Extract assignee information for a specific epic row
 *
 * Scoped to the epic's issue ID - only counts assignees from cells
 * belonging to this specific issue.
 *
 * Assignees are in separate cells with:
 * - data-issue attribute matching the epic's issue ID
 * - data-name starting with "cell-"
 * - <span class="_2v7GN"> containing assignee name
 */
export function extractAssignees(epicRow: HTMLElement): AssigneeData {
  const issueId = epicRow.getAttribute('data-issue');
  if (!issueId) {
    return { count: 0, isExpanded: false, uniqueUsers: [] };
  }

  const uniqueUsers = new Set<string>();

  // Find assignee cells scoped to this specific epic's issue ID
  const assigneeCells = document.querySelectorAll(`[data-issue="${issueId}"][data-name^="cell-"]`);

  assigneeCells.forEach(cell => {
    // NOTE: ._2v7GN is a minified Jira class name that may change between Jira versions.
    // This is a known fragility -- the API path (fetchAccurateCount) is the primary
    // data source; this DOM-based extraction is a fallback for initial display.
    const assigneeSpan = cell.querySelector('._2v7GN');
    if (assigneeSpan) {
      const assigneeName = assigneeSpan.textContent?.trim();
      if (assigneeName && assigneeName !== '') {
        uniqueUsers.add(assigneeName);
      }
    }
  });

  const isExpanded = uniqueUsers.size > 0;

  return {
    count: uniqueUsers.size,
    isExpanded,
    uniqueUsers: Array.from(uniqueUsers).sort(),
  };
}

/**
 * Extract complete epic data from an epic row element
 *
 * Using stable selectors:
 * - a[href*="/browse/"] for epic key (more stable than class)
 * - Structural relationship for title (near epic key)
 */
export function extractEpicData(epicRow: HTMLElement): EpicData | null {
  const issueId = epicRow.getAttribute('data-issue');
  if (!issueId) {
    return null;
  }

  // More resilient: find link by href pattern instead of minified class
  const keyLink = epicRow.querySelector('a[href*="/browse/"]') as HTMLAnchorElement;
  const epicKey = keyLink?.textContent?.trim() || '';

  // Title is harder - find by structure: it's a div with substantial text near the epic key
  // For now, we don't strictly need the title, so we'll keep it optional
  let title = '';
  if (keyLink) {
    // Look for divs near the key link with text content
    const parent = keyLink.parentElement;
    const potentialTitles = parent?.querySelectorAll('div');
    if (potentialTitles) {
      for (const div of potentialTitles) {
        const text = div.textContent?.trim();
        // Title should be longer and not contain the epic key
        if (text && text.length > 10 && !text.includes(epicKey)) {
          title = text;
          break;
        }
      }
    }
  }

  const assigneeData = extractAssignees(epicRow);

  return {
    epicKey,
    title,
    assigneeCount: assigneeData.count,
    isExpanded: assigneeData.isExpanded,
    element: epicRow,
  };
}
