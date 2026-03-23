/**
 * Tests for Badge Styles
 */

import { STYLES, injectBadgeStyles } from './badge-styles';

describe('STYLES constants', () => {
  it('exports expected class names', () => {
    expect(STYLES.badge).toBe('jpe-badge');
    expect(STYLES.timelineBadge).toBe('jpe-timeline-badge');
    expect(STYLES.timelineBadgeAvatars).toBe('jpe-timeline-badge--avatars');
    expect(STYLES.timelineBadgeWarning).toBe('jpe-timeline-badge--warning');
    expect(STYLES.timelineBadgePw).toBe('jpe-timeline-badge--pw');
    expect(STYLES.storyAvatar).toBe('jpe-story-avatar');
    expect(STYLES.storyPwUnestimated).toBe('jpe-story-pw--unestimated');
    expect(STYLES.storyPwEstimated).toBe('jpe-story-pw--estimated');
  });
});

describe('injectBadgeStyles', () => {
  beforeEach(() => {
    // Clean up any injected style elements
    const existing = document.getElementById('jira-plans-enhanced-styles');
    if (existing) existing.remove();
  });

  it('injects a style element into document.head', () => {
    injectBadgeStyles();

    const style = document.getElementById('jira-plans-enhanced-styles');
    expect(style).not.toBeNull();
    expect(style!.tagName).toBe('STYLE');
    expect(style!.textContent).toContain('.jpe-badge');
    expect(style!.textContent).toContain('.jpe-timeline-badge');
  });

  it('is idempotent — second call does not create duplicate', () => {
    injectBadgeStyles();
    injectBadgeStyles();

    const styles = document.querySelectorAll('#jira-plans-enhanced-styles');
    expect(styles).toHaveLength(1);
  });

  it('includes all STYLES class names in the CSS', () => {
    injectBadgeStyles();

    const css = document.getElementById('jira-plans-enhanced-styles')!.textContent!;
    for (const className of Object.values(STYLES)) {
      expect(css).toContain(`.${className}`);
    }
  });
});
