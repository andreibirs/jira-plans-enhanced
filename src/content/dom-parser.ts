/**
 * DOM Parser for Jira Plans
 *
 * Extracts epic and assignee data from the real Jira Plans page DOM structure
 *
 * Real Jira Plans Structure:
 * - Epic rows: <div data-issue="18794394" data-name="scope-issue-18794394">
 * - Epic key: <a class="_3HCO4" href="/browse/GS-22732">GS-22732</a>
 * - Epic title: <div class="_1hfWN">[Canvas Edit] Logo Swap...</div>
 * - Assignee cells (separate): <div data-issue="18794394" data-name="cell-18794394">
 * - Assignee name: <span class="_2v7GN">Andrei Birsan</span>
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
 * Check if a row is an epic (not a story)
 *
 * Epics have avatarId=18807 in their issue type icon background-image
 * Stories have avatarId=18815
 *
 * Using [style*="avatarId"] instead of class name for stability
 */
function isEpicRow(row: HTMLElement): boolean {
  // More resilient: use style attribute instead of minified class name
  const iconElement = row.querySelector('[style*="avatarId"]') as HTMLElement;
  if (!iconElement) {
    return false;
  }

  const backgroundImage = iconElement.style.backgroundImage;
  return backgroundImage.includes('avatarId=18807');
}

/**
 * Find all epic rows in the current Jira Plans view
 *
 * Epic rows are identified by:
 * - data-issue attribute (contains issue ID)
 * - data-name attribute starting with "scope-issue-"
 * - Issue type icon with avatarId=18807 (epic avatar)
 */
export function findEpicRows(): HTMLElement[] {
  const allRows = document.querySelectorAll('[data-issue][data-name^="scope-issue-"]');
  const epicRows = Array.from(allRows).filter(row => isEpicRow(row as HTMLElement));
  return epicRows as HTMLElement[];
}

/**
 * Extract assignee information from visible rows
 *
 * Strategy:
 * For now, count ALL unique assignees across ALL visible rows.
 * This is a simplified approach - we'll refine epic/story hierarchy later.
 *
 * Assignees are in separate cells with:
 * - data-issue attribute (correlates with row)
 * - data-name starting with "cell-"
 * - <span class="_2v7GN"> containing assignee name
 */
export function extractAssignees(epicRow: HTMLElement): AssigneeData {
  const issueId = epicRow.getAttribute('data-issue');
  if (!issueId) {
    return { count: 0, isExpanded: false, uniqueUsers: [] };
  }

  const uniqueUsers = new Set<string>();

  // Find all assignee cells (for ALL issues, not just this epic)
  // This is a simplified implementation - we'll add hierarchy later
  const assigneeCells = document.querySelectorAll('[data-issue][data-name^="cell-"]');

  assigneeCells.forEach(cell => {
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
