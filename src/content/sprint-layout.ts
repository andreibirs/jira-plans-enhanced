/**
 * Sprint Layout Calculator
 *
 * Calculates sprint positions on the timeline to determine where to place badges
 */

export interface SprintSegment {
  sprintName: string;
  startPercent: number;
  endPercent: number;
  width: number;
  // Actual pixel positions for accurate positioning
  startPixel: number;
  endPixel: number;
}

/**
 * Normalize sprint name for consistent matching between API and DOM
 * Handles different formats:
 * - DOM: "sprint-header-26.5---GS-Ares-Create-+-R&A" → "26.5 - GS Ares Create + R&A"
 * - API: "26.5 - GS Ares Create + R&A" → "26.5 - GS Ares Create + R&A"
 */
export function normalizeSprintName(name: string): string {
  return name
    .replace('sprint-header-', '') // Remove prefix
    .replace(/---/g, ' - ')        // Convert --- to single dash with spaces
    .replace(/-/g, ' ')            // Convert remaining hyphens to spaces
    .replace(/\s+/g, ' ')          // Collapse multiple spaces to single space
    .trim();
}

/**
 * Get all sprint headers from the DOM and calculate their positions
 * Uses actual pixel positions for accurate badge placement
 *
 * @param teamId - Optional team ID to get sprint layout for a specific team
 *                 If not provided, uses the first team's sprint headers
 */
export function getSprintLayout(teamId?: string): SprintSegment[] {
  // Find the sprint stream container for the specified team
  let sprintStream: Element | null = null;

  if (teamId) {
    // Try to find sprint stream with matching team ID
    sprintStream = document.querySelector(`[data-name*="team-${teamId}"][data-name*="sprint-stream"]`);
  }

  // Fallback to first sprint stream if team-specific one not found
  if (!sprintStream) {
    sprintStream = document.querySelector('[data-name*="sprint-stream-"]');
  }

  if (!sprintStream) {
    return [];
  }

  // Only get sprint headers within this first team's stream
  const sprintHeaders = sprintStream.querySelectorAll('[data-name^="sprint-header-"]');
  const segments: SprintSegment[] = [];

  let cumulativePercent = 0;

  for (const header of sprintHeaders) {
    const element = header as HTMLElement;
    const dataName = element.getAttribute('data-name');
    if (!dataName) continue;

    // Extract and normalize sprint name
    const sprintName = normalizeSprintName(dataName);

    // Extract width percentage from style
    const widthMatch = element.style.width.match(/([0-9.]+)%/);
    if (!widthMatch) continue;

    const width = parseFloat(widthMatch[1]);

    // Get actual pixel positions for accurate positioning
    const rect = element.getBoundingClientRect();

    segments.push({
      sprintName,
      startPercent: cumulativePercent,
      endPercent: cumulativePercent + width,
      width,
      startPixel: rect.left,
      endPixel: rect.right,
    });

    cumulativePercent += width;
  }

  return segments;
}

/**
 * Find which sprints a timeline bar overlaps
 * Timeline bar has style="left: X%; right: Y%"
 * Note: right is from the right edge, so actual end = 100 - right
 */
export function getOverlappingSprints(
  barLeftPercent: number,
  barRightPercent: number,
  sprintLayout: SprintSegment[]
): SprintSegment[] {
  const barEndPercent = 100 - barRightPercent;

  return sprintLayout.filter(sprint => {
    // Check if sprint overlaps with the bar
    // Sprint overlaps if: sprint.end > bar.start AND sprint.start < bar.end
    return sprint.endPercent > barLeftPercent && sprint.startPercent < barEndPercent;
  });
}

/**
 * Calculate badge position within a timeline bar for a given sprint
 * Returns percentage position relative to the bar (0-100)
 * Uses actual pixel positions for accurate alignment
 */
export function calculateBadgePosition(
  sprintSegment: SprintSegment,
  barElement: HTMLElement
): number {
  // Get actual pixel positions of sprint column
  const sprintCenterPixel = (sprintSegment.startPixel + sprintSegment.endPixel) / 2;

  // Get actual pixel positions of timeline bar
  const barRect = barElement.getBoundingClientRect();
  const barLeftPixel = barRect.left;
  const barWidth = barRect.width;

  // Calculate relative position as percentage of bar width
  const pixelOffset = sprintCenterPixel - barLeftPixel;
  const positionPercent = (pixelOffset / barWidth) * 100;

  return positionPercent;
}
