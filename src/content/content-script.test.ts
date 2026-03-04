/**
 * Tests for Content Script
 *
 * Tests the main orchestration logic that coordinates DOM parsing,
 * badge injection, and MutationObserver for dynamic updates
 *
 * Uses real Jira Plans DOM structure
 */

// Mock console to avoid noise in test output
global.console = {
  ...console,
  log: jest.fn(),
};

import { processEpics, setupObserver, __test_populateCache__, __test_clearCache__ } from './content-script';

describe('Content Script', () => {
  describe('processEpics', () => {
    beforeEach(() => {
      __test_clearCache__();
    });

    it('should process all epics and inject badges with real Jira Plans structure', () => {
      __test_populateCache__('EPIC-123', 2, ['Alice Smith', 'John Doe']);
      __test_populateCache__('EPIC-456', 2, ['Alice Smith', 'John Doe']);

      document.body.innerHTML = `
        <div class="jira-plans">
          <!-- Epic 1 -->
          <div data-issue="18794394" data-name="scope-issue-18794394">
            <div style="background-image: url('avatarId=18807')"></div>
            <div class="epic-key-container">
              <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
            </div>
            <div class="_1hfWN">Epic 1</div>
          </div>

          <!-- Epic 2 -->
          <div data-issue="18794395" data-name="scope-issue-18794395">
            <div style="background-image: url('avatarId=18807')"></div>
            <div class="epic-key-container">
              <a class="_3HCO4" href="/browse/EPIC-456">EPIC-456</a>
            </div>
            <div class="_1hfWN">Epic 2</div>
          </div>

          <!-- Story rows -->
          <div data-issue="18794396" data-name="story-18794396"></div>
          <div data-issue="18794397" data-name="story-18794397"></div>

          <!-- Assignee cells -->
          <div data-issue="18794396" data-name="cell-18794396" class="_26___">
            <span class="_2v7GN">Alice Smith</span>
          </div>
          <div data-issue="18794397" data-name="cell-18794397" class="_26___">
            <span class="_2v7GN">John Doe</span>
          </div>
        </div>
      `;

      const result = processEpics();

      expect(result.processed).toBe(2);
      // Each epic gets 2 badges: left panel + timeline = 4 total
      expect(result.injected).toBe(4);

      // Both epics should have badges with total unique assignees
      const epic1 = document.querySelector('[data-issue="18794394"]');
      const badge1 = epic1?.querySelector('.jira-plans-headcount-badge');
      expect(badge1?.textContent).toBe('2 👥');

      const epic2 = document.querySelector('[data-issue="18794395"]');
      const badge2 = epic2?.querySelector('.jira-plans-headcount-badge');
      expect(badge2?.textContent).toBe('2 👥');
    });

    it('should skip injection but update existing badges', () => {
      __test_populateCache__('EPIC-123', 1, ['Alice Smith']);

      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div style="background-image: url('avatarId=18807')"></div>
          <span class="jira-plans-headcount-badge" data-epic-key="EPIC-123">3 👥</span>
          <div class="epic-key-container">
            <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
          </div>
          <div class="_1hfWN">Epic 1</div>
        </div>
        <div data-issue="18794396" data-name="cell-18794396" class="_26___">
          <span class="_2v7GN">Alice Smith</span>
        </div>
      `;

      const result = processEpics();

      expect(result.processed).toBe(1);
      // Updates existing badge (left panel + timeline = 2)
      expect(result.injected).toBe(2);

      // Badge should be updated to reflect current DOM state
      const badge = document.querySelector('.jira-plans-headcount-badge');
      expect(badge?.textContent).toBe('1 👥');
    });

    it('should return zero counts when no epics found', () => {
      document.body.innerHTML = `<div class="jira-plans"></div>`;

      const result = processEpics();

      expect(result.processed).toBe(0);
      expect(result.injected).toBe(0);
    });

    it('should handle epics without valid data gracefully', () => {
      document.body.innerHTML = `
        <div data-issue="18794394" data-name="scope-issue-18794394">
          <div style="background-image: url('avatarId=18807')"></div>
          <div class="epic-key-container">
            <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
          </div>
          <!-- No title element -->
        </div>
      `;

      const result = processEpics();

      expect(result.processed).toBe(1);
      expect(result.injected).toBe(0);
    });
  });

  describe('setupObserver', () => {
    it('should create MutationObserver that watches for DOM changes', () => {
      document.body.innerHTML = `<div class="jira-plans"></div>`;

      const observer = setupObserver();

      expect(observer).toBeInstanceOf(MutationObserver);

      // Clean up
      observer.disconnect();
    });

    it('should process new epics when they are added to DOM', (done) => {
      __test_populateCache__('EPIC-789', 1, ['Alice Smith']);

      document.body.innerHTML = `<div class="jira-plans" id="plan-container"></div>`;

      const observer = setupObserver(10); // Use short debounce for testing

      // Add new epic after a delay
      setTimeout(() => {
        const container = document.getElementById('plan-container');
        if (container) {
          container.innerHTML = `
            <div data-issue="18794398" data-name="scope-issue-18794398">
              <div style="background-image: url('avatarId=18807')"></div>
              <div class="epic-key-container">
                <a class="_3HCO4" href="/browse/EPIC-789">EPIC-789</a>
              </div>
              <div class="_1hfWN">New Epic</div>
            </div>
            <div data-issue="18794399" data-name="cell-18794399" class="_26___">
              <span class="_2v7GN">Alice Smith</span>
            </div>
          `;
        }

        // Give MutationObserver time to process (longer timeout for CI environments)
        setTimeout(() => {
          const badge = document.querySelector('.jira-plans-headcount-badge');
          expect(badge).not.toBeNull();
          expect(badge?.textContent).toBe('1 👥');

          observer.disconnect();
          done();
        }, 500);
      }, 50);
    });

    it('should update badges when assignees are added', (done) => {
      // First populate with 1 assignee
      __test_populateCache__('EPIC-123', 1, ['Alice Smith']);

      document.body.innerHTML = `
        <div class="jira-plans" id="plan-container">
          <div data-issue="18794394" data-name="scope-issue-18794394">
            <div style="background-image: url('avatarId=18807')"></div>
            <span class="jira-plans-headcount-badge" data-epic-key="EPIC-123">1 👥</span>
            <div class="epic-key-container">
              <a class="_3HCO4" href="/browse/EPIC-123">EPIC-123</a>
            </div>
            <div class="_1hfWN">Epic 1</div>
          </div>
          <div data-issue="18794396" data-name="cell-18794396" class="_26___">
            <span class="_2v7GN">Alice Smith</span>
          </div>
        </div>
      `;

      const observer = setupObserver(10); // Use short debounce for testing

      // Add more assignees
      setTimeout(() => {
        const container = document.getElementById('plan-container');
        if (container) {
          container.innerHTML += `
            <div data-issue="18794397" data-name="cell-18794397" class="_26___">
              <span class="_2v7GN">John Doe</span>
            </div>
          `;
        }

        // Update cache to reflect the new assignee
        __test_populateCache__('EPIC-123', 2, ['Alice Smith', 'John Doe']);

        // Give MutationObserver time to process (longer timeout for CI environments)
        setTimeout(() => {
          const badge = document.querySelector('.jira-plans-headcount-badge');
          expect(badge?.textContent).toBe('2 👥');

          observer.disconnect();
          done();
        }, 500);
      }, 50);
    });
  });
});
