/**
 * Tests for Badge UI Component
 *
 * Tests the creation and injection of headcount badges next to epic titles
 */

import { createBadge, injectBadge, updateBadge, removeBadge } from './badge';

describe('Badge UI', () => {
  describe('createBadge', () => {
    it('should create badge element with count for expanded epic', () => {
      const badge = createBadge(5, true);

      expect(badge.tagName).toBe('SPAN');
      expect(badge.classList.contains('jira-plans-headcount-badge')).toBe(true);
      expect(badge.textContent).toBe('5 👥');
      expect(badge.title).toContain('5 unique engineers working on this epic');
    });

    it('should create badge with zero count', () => {
      const badge = createBadge(0, false);

      expect(badge.textContent).toBe('0 👥');
      expect(badge.title).toContain('No assignees found for this epic');
    });

    it('should handle zero assignees in expanded epic', () => {
      const badge = createBadge(0, true);

      expect(badge.textContent).toBe('0 👥');
      expect(badge.title).toContain('No assignees');
    });

    it('should apply correct styling', () => {
      const badge = createBadge(3, true);

      expect(badge.style.marginRight).toBe('8px');
      expect(badge.style.padding).toBe('2px 6px');
      expect(badge.style.backgroundColor).toBe('rgb(224, 224, 224)');
      expect(badge.style.borderRadius).toBe('4px');
      expect(badge.style.fontSize).toBe('11px');
    });
  });

  describe('injectBadge', () => {
    it('should inject badge next to epic title in real Jira Plans structure', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div class="epic-key-container">
            <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
          </div>
          <div class="_1hfWN">Epic Title</div>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"]') as HTMLElement;
      const result = injectBadge(epicRow, 5, true, 'EPIC-123');

      expect(result).toBe(true);

      const badge = epicRow.querySelector('.jira-plans-headcount-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('5 👥');
    });

    it('should not inject duplicate badge', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <span class="jira-plans-headcount-badge" data-epic-key="EPIC-123">3 👥</span>
          <div class="epic-key-container">
            <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
          </div>
          <div class="_1hfWN">Epic Title</div>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"]') as HTMLElement;
      const result = injectBadge(epicRow, 5, true, 'EPIC-123');

      expect(result).toBe(false);

      const badges = document.querySelectorAll('.jira-plans-headcount-badge');
      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toBe('3 👥'); // Original badge unchanged
    });

    it('should return false if epic key link not found', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div>Some content without epic key link</div>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"]') as HTMLElement;
      const result = injectBadge(epicRow, 5, true);

      expect(result).toBe(false);
    });
  });

  describe('updateBadge', () => {
    it('should update existing badge content', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div class="_1hfWN">Epic Title</div>
          <span class="jira-plans-headcount-badge">3 👥</span>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"]') as HTMLElement;
      const result = updateBadge(epicRow, 7, true);

      expect(result).toBe(true);

      const badge = epicRow.querySelector('.jira-plans-headcount-badge') as HTMLElement;
      expect(badge?.textContent).toBe('7 👥');
      expect(badge?.title).toContain('7 unique engineers working on this epic');
    });

    it('should update from collapsed to expanded state', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div class="_1hfWN">Epic Title</div>
          <span class="jira-plans-headcount-badge">? 👥</span>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"]') as HTMLElement;
      const result = updateBadge(epicRow, 5, true);

      expect(result).toBe(true);

      const badge = epicRow.querySelector('.jira-plans-headcount-badge');
      expect(badge?.textContent).toBe('5 👥');
    });

    it('should return false if badge does not exist', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div class="_1hfWN">Epic Title</div>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"]') as HTMLElement;
      const result = updateBadge(epicRow, 5, true);

      expect(result).toBe(false);
    });
  });

  describe('removeBadge', () => {
    it('should remove badge from epic row', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div class="_1hfWN">Epic Title</div>
          <span class="jira-plans-headcount-badge">5 👥</span>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"]') as HTMLElement;
      const result = removeBadge(epicRow);

      expect(result).toBe(true);

      const badge = epicRow.querySelector('.jira-plans-headcount-badge');
      expect(badge).toBeNull();
    });

    it('should return false if badge does not exist', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div class="_1hfWN">Epic Title</div>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"]') as HTMLElement;
      const result = removeBadge(epicRow);

      expect(result).toBe(false);
    });
  });
});
