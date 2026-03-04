/**
 * Tests for DOM Parser
 *
 * Tests the extraction of epic and assignee data from real Jira Plans DOM structure
 *
 * Real Jira Plans Structure:
 * - Epic rows: <div data-issue="18794394" data-name="scope-issue-18794394">
 * - Epic key: <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
 * - Epic title: <div class="_1hfWN">[Canvas Edit] Logo Swap...</div>
 * - Assignee cells (separate): <div data-issue="18794394" data-name="cell-18794394">
 * - Assignee name: <span class="_2v7GN">Alice Smith</span>
 */

import { extractEpicData, extractAssignees, findEpicRows } from './dom-parser';

describe('DOM Parser', () => {
  describe('findEpicRows', () => {
    it('should find epic rows by data-issue and scope-issue data-name', () => {
      document.body.innerHTML = `
        <div class="jira-plans">
          <div data-issue="18794394" data-name="scope-issue-18794394">
            <div style="background-image: url('avatarId=18807')"></div>
            <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
            <div class="_1hfWN">[Canvas Edit] Logo Swap</div>
          </div>
          <div data-issue="18794395" data-name="scope-issue-18794395">
            <div style="background-image: url('avatarId=18807')"></div>
            <a class="_3HCO4" href="/browse/EPIC-456">EPIC-456</a>
            <div class="_1hfWN">Another Epic</div>
          </div>
          <div data-issue="18794396" data-name="story-18794396">
            <div style="background-image: url('avatarId=18815')"></div>
            Story 1
          </div>
        </div>
      `;

      const epicRows = findEpicRows();

      expect(epicRows).toHaveLength(2);
      expect(epicRows[0].getAttribute('data-issue')).toBe('18794394');
      expect(epicRows[1].getAttribute('data-issue')).toBe('18794395');
    });

    it('should return empty array when no epics found', () => {
      document.body.innerHTML = `<div class="jira-plans"></div>`;

      const epicRows = findEpicRows();

      expect(epicRows).toHaveLength(0);
    });
  });

  describe('extractAssignees', () => {
    it('should extract assignee from separate cell using data-issue correlation', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
          <div class="_1hfWN">Epic Title</div>
        </div>
        <div data-issue="18794394" data-name="cell-18794394" class="_26___">
          <span class="_2v7GN">Alice Smith</span>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"][data-name^="scope-issue-"]') as HTMLElement;
      const assignees = extractAssignees(epicRow);

      expect(assignees.count).toBe(1);
      expect(assignees.isExpanded).toBe(true);
      expect(assignees.uniqueUsers).toEqual(['Alice Smith']);
    });

    it('should extract unique assignees from multiple rows with same data-issue', () => {
      document.body.innerHTML = `
        <!-- Epic row -->
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
        </div>

        <!-- Story rows with same parent -->
        <div data-issue="18794395" data-name="story-18794395"></div>
        <div data-issue="18794396" data-name="story-18794396"></div>
        <div data-issue="18794397" data-name="story-18794397"></div>

        <!-- Assignee cells (separate column) -->
        <div data-issue="18794395" data-name="cell-18794395" class="_26___">
          <span class="_2v7GN">Alice Smith</span>
        </div>
        <div data-issue="18794396" data-name="cell-18794396" class="_26___">
          <span class="_2v7GN">John Doe</span>
        </div>
        <div data-issue="18794397" data-name="cell-18794397" class="_26___">
          <span class="_2v7GN">Alice Smith</span>
        </div>
      `;

      // For now, we'll count all visible assignees (not just children of one epic)
      // This is a simplified implementation - we'll refine hierarchy later
      const epicRow = document.querySelector('[data-issue="18794394"][data-name^="scope-issue-"]') as HTMLElement;
      const assignees = extractAssignees(epicRow);

      expect(assignees.count).toBe(2); // Unique: Alice Smith, John Doe
      expect(assignees.uniqueUsers).toEqual(['Alice Smith', 'John Doe']);
    });

    it('should handle missing assignee cell gracefully', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
        </div>
        <!-- No corresponding assignee cell -->
      `;

      const epicRow = document.querySelector('[data-issue="18794394"][data-name^="scope-issue-"]') as HTMLElement;
      const assignees = extractAssignees(epicRow);

      expect(assignees.count).toBe(0);
      expect(assignees.uniqueUsers).toEqual([]);
    });

    it('should handle empty assignee span gracefully', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394"></div>
        <div data-issue="18794394" data-name="cell-18794394" class="_26___">
          <span class="_2v7GN"></span>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"][data-name^="scope-issue-"]') as HTMLElement;
      const assignees = extractAssignees(epicRow);

      expect(assignees.count).toBe(0);
      expect(assignees.uniqueUsers).toEqual([]);
    });

    it('should handle missing assignee span element', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394"></div>
        <div data-issue="18794394" data-name="cell-18794394" class="_26___">
          <!-- No span element -->
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"][data-name^="scope-issue-"]') as HTMLElement;
      const assignees = extractAssignees(epicRow);

      expect(assignees.count).toBe(0);
      expect(assignees.uniqueUsers).toEqual([]);
    });
  });

  describe('extractEpicData', () => {
    it('should extract complete epic data from real Jira Plans structure', () => {
      document.body.innerHTML = `
        <!-- Epic row -->
        <div data-issue="18794394" data-name="scope-issue-18794394" class="_3yBvl _3g3c2">
          <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
          <div class="_1hfWN">[Canvas Edit] Logo Swap Feature</div>
        </div>

        <!-- Child story rows -->
        <div data-issue="18794395" data-name="story-18794395"></div>
        <div data-issue="18794396" data-name="story-18794396"></div>

        <!-- Assignee cells -->
        <div data-issue="18794395" data-name="cell-18794395" class="_26___">
          <span class="_2v7GN">Alice Smith</span>
        </div>
        <div data-issue="18794396" data-name="cell-18794396" class="_26___">
          <span class="_2v7GN">John Doe</span>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"][data-name^="scope-issue-"]') as HTMLElement;
      const epicData = extractEpicData(epicRow);

      expect(epicData).not.toBeNull();
      expect(epicData?.epicKey).toBe('EPIC-123');
      expect(epicData?.title).toBe('[Canvas Edit] Logo Swap Feature');
      expect(epicData?.assigneeCount).toBe(2);
      expect(epicData?.isExpanded).toBe(true);
    });

    it('should handle missing epic key link', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div class="_1hfWN">Epic without key</div>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"][data-name^="scope-issue-"]') as HTMLElement;
      const epicData = extractEpicData(epicRow);

      expect(epicData).not.toBeNull();
      expect(epicData?.epicKey).toBe('');
      // Note: Title extraction requires keyLink to exist, so it returns empty without one
      expect(epicData?.title).toBe('');
    });

    it('should handle missing title element', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
        </div>
      `;

      const epicRow = document.querySelector('[data-issue="18794394"][data-name^="scope-issue-"]') as HTMLElement;
      const epicData = extractEpicData(epicRow);

      expect(epicData).not.toBeNull();
      expect(epicData?.epicKey).toBe('EPIC-123');
      expect(epicData?.title).toBe('');
      expect(epicData?.assigneeCount).toBe(0);
    });

    it('should return null for row without data-issue', () => {
      document.body.innerHTML = `<div class="epic-row"></div>`;

      const epicRow = document.querySelector('.epic-row') as HTMLElement;
      const epicData = extractEpicData(epicRow);

      expect(epicData).toBeNull();
    });
  });
});
