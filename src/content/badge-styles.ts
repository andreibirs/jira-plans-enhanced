/**
 * Badge CSS Styles
 *
 * Centralised stylesheet for all badge UI components.
 * Replaces inline styles in badge.ts with CSS classes injected once into
 * the host page via a <style> element.
 *
 * Call `injectBadgeStyles()` early (e.g. in content-script init) to ensure
 * styles are available before any badges are created.
 */

// ---------------------------------------------------------------------------
// CSS class-name constants
// ---------------------------------------------------------------------------

export const STYLES = {
  badge: 'jpe-badge',
  timelineBadge: 'jpe-timeline-badge',
  timelineBadgeAvatars: 'jpe-timeline-badge--avatars',
  timelineBadgeWarning: 'jpe-timeline-badge--warning',
  timelineBadgePw: 'jpe-timeline-badge--pw',
  storyAvatar: 'jpe-story-avatar',
  storyPwUnestimated: 'jpe-story-pw--unestimated',
  storyPwEstimated: 'jpe-story-pw--estimated',
} as const;

// ---------------------------------------------------------------------------
// Stylesheet content
// ---------------------------------------------------------------------------

const STYLE_ELEMENT_ID = 'jira-plans-enhanced-styles';

const CSS = `
/* ---- Left-panel badge ---- */
.${STYLES.badge} {
  margin-right: 8px;
  padding: 2px 6px;
  background-color: #e0e0e0;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  color: #333;
  display: inline-block;
  vertical-align: middle;
}

/* ---- Timeline badge (base) ---- */
.${STYLES.timelineBadge} {
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
  z-index: 2;
  min-width: 18px;
  max-width: 90%;
  cursor: help;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- Timeline badge: avatar mode ---- */
.${STYLES.timelineBadgeAvatars} {
  padding: 0;
  background-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: auto;
  max-width: none;
  overflow: visible;
}

/* ---- Timeline badge: warning / no-sprint ---- */
.${STYLES.timelineBadgeWarning} {
  background-color: rgba(255, 152, 0, 0.8);
  z-index: 3;
  min-width: 24px;
}

/* ---- Timeline badge: person-weeks ---- */
.${STYLES.timelineBadgePw} {
  background-color: rgba(100, 50, 150, 0.75);
}

/* ---- Story avatar wrapper ---- */
.${STYLES.storyAvatar} {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  z-index: 2;
}

/* ---- Story PW badge: unestimated ---- */
.${STYLES.storyPwUnestimated} {
  background-color: rgba(255, 152, 0, 0.85);
  overflow: visible;
  max-width: none;
}

/* ---- Story PW badge: estimated ---- */
.${STYLES.storyPwEstimated} {
  background-color: rgba(100, 50, 150, 0.75);
  overflow: visible;
  max-width: none;
}
`;

// ---------------------------------------------------------------------------
// Injection function
// ---------------------------------------------------------------------------

/**
 * Inject the badge stylesheet into `document.head`.
 *
 * Idempotent: if the `<style>` element already exists (identified by its
 * `id` attribute) the function returns immediately without creating a
 * duplicate.
 */
export function injectBadgeStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
