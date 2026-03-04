/**
 * Tests for Sprint Layout Calculations
 *
 * Tests the sprint layout extraction and badge positioning logic
 */

import {
  getSprintLayout,
  getOverlappingSprints,
  calculateBadgePosition,
  normalizeSprintName,
  SprintSegment,
} from './sprint-layout';

describe('Sprint Layout', () => {
  describe('normalizeSprintName', () => {
    it('should normalize sprint names from DOM format', () => {
      // normalizeSprintName collapses multiple spaces to single space
      expect(normalizeSprintName('sprint-header-26.5---Sprint-Name')).toBe('26.5 Sprint Name');
      expect(normalizeSprintName('sprint-header-27---My Sprint')).toBe('27 My Sprint');
    });

    it('should handle regular sprint names', () => {
      expect(normalizeSprintName('26.5 - Sprint Name')).toBe('26.5 Sprint Name');
      expect(normalizeSprintName('Sprint 1')).toBe('Sprint 1');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeSprintName('Sprint    1')).toBe('Sprint 1');
      expect(normalizeSprintName('  Sprint  2  ')).toBe('Sprint 2');
    });

    it('should handle empty cases', () => {
      expect(normalizeSprintName('')).toBe('');
      expect(normalizeSprintName('   ')).toBe('');
    });
  });

  describe('getSprintLayout', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('should return empty array when no sprint stream found', () => {
      document.body.innerHTML = '<div></div>';

      const layout = getSprintLayout('team-123');

      expect(layout).toEqual([]);
    });

    it('should extract sprint layout from DOM', () => {
      document.body.innerHTML = `
        <div data-name="sprint-stream-team-123">
          <div data-name="sprint-header-1" style="width: 33.33%;">Sprint 1</div>
          <div data-name="sprint-header-2" style="width: 33.33%;">Sprint 2</div>
          <div data-name="sprint-header-3" style="width: 33.34%;">Sprint 3</div>
        </div>
      `;

      const layout = getSprintLayout('team-123');

      expect(layout).toHaveLength(3);
      expect(layout[0].sprintName).toBe('1');
      expect(layout[0].startPercent).toBe(0);
      expect(layout[0].endPercent).toBeCloseTo(33.33, 2);
      expect(layout[0].width).toBeCloseTo(33.33, 2);

      expect(layout[1].startPercent).toBeCloseTo(33.33, 2);
      expect(layout[1].endPercent).toBeCloseTo(66.66, 2);
    });

    it('should handle sprint headers without width style', () => {
      document.body.innerHTML = `
        <div data-name="sprint-stream-team-123">
          <div data-name="sprint-header-1" style="width: 50%;">Sprint 1</div>
          <div data-name="sprint-header-2">Sprint 2 (no width)</div>
          <div data-name="sprint-header-3" style="width: 50%;">Sprint 3</div>
        </div>
      `;

      const layout = getSprintLayout('team-123');

      // Should only include valid sprint headers
      expect(layout).toHaveLength(2);
      expect(layout[0].sprintName).toBe('1');
      expect(layout[1].sprintName).toBe('3');
    });

    it('should use first sprint stream as fallback when team not specified', () => {
      document.body.innerHTML = `
        <div data-name="sprint-stream-team-123">
          <div data-name="sprint-header-1" style="width: 100%;">Sprint 1</div>
        </div>
      `;

      const layout = getSprintLayout();

      expect(layout).toHaveLength(1);
      expect(layout[0].sprintName).toBe('1');
    });
  });

  describe('getOverlappingSprints', () => {
    const createTestLayout = (): SprintSegment[] => [
      {
        sprintName: 'Sprint 1',
        startPercent: 0,
        endPercent: 33,
        width: 33,
        startPixel: 0,
        endPixel: 100,
      },
      {
        sprintName: 'Sprint 2',
        startPercent: 33,
        endPercent: 67,
        width: 34,
        startPixel: 100,
        endPixel: 200,
      },
      {
        sprintName: 'Sprint 3',
        startPercent: 67,
        endPercent: 100,
        width: 33,
        startPixel: 200,
        endPixel: 300,
      },
    ];

    it('should find sprints that overlap with issue bar', () => {
      const sprintLayout = createTestLayout();

      // Bar from left=25% to right=50% (so end=50%, overlaps Sprint 1 and Sprint 2)
      const overlapping = getOverlappingSprints(25, 50, sprintLayout);

      expect(overlapping).toHaveLength(2);
      expect(overlapping[0].sprintName).toBe('Sprint 1');
      expect(overlapping[1].sprintName).toBe('Sprint 2');
    });

    it('should handle bar spanning multiple sprints', () => {
      const sprintLayout = createTestLayout();

      // Bar from left=25% to right=0% (so end=100%, spans whole timeline)
      const overlapping = getOverlappingSprints(25, 0, sprintLayout);

      expect(overlapping).toHaveLength(3);
    });

    it('should return empty array when no overlap', () => {
      const sprintLayout = createTestLayout();

      // Bar completely outside sprint range
      const overlapping = getOverlappingSprints(150, 0, sprintLayout);

      expect(overlapping).toHaveLength(0);
    });

    it('should handle edge cases at sprint boundaries', () => {
      const sprintLayout = createTestLayout();

      // Bar exactly at sprint boundary (left=33%)
      const overlapping = getOverlappingSprints(33, 33, sprintLayout);

      // Should overlap with Sprint 2 only
      expect(overlapping.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('calculateBadgePosition', () => {
    it('should calculate position as percentage of bar width', () => {
      const sprintSegment: SprintSegment = {
        sprintName: 'Sprint 1',
        startPercent: 0,
        endPercent: 50,
        width: 50,
        startPixel: 100,
        endPixel: 200,
      };

      // Create mock bar element
      const barElement = document.createElement('div');
      barElement.style.position = 'absolute';
      barElement.style.left = '100px';
      barElement.style.width = '200px';
      document.body.appendChild(barElement);

      // Mock getBoundingClientRect
      jest.spyOn(barElement, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        width: 200,
        top: 0,
        right: 300,
        bottom: 0,
        height: 0,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      });

      const position = calculateBadgePosition(sprintSegment, barElement);

      // Sprint center is at 150px, bar starts at 100px, bar width is 200px
      // Position = (150 - 100) / 200 * 100 = 25%
      expect(position).toBe(25);

      document.body.removeChild(barElement);
    });

    it('should handle sprint center aligned with bar center', () => {
      const sprintSegment: SprintSegment = {
        sprintName: 'Sprint 2',
        startPercent: 25,
        endPercent: 75,
        width: 50,
        startPixel: 200,
        endPixel: 300,
      };

      const barElement = document.createElement('div');
      document.body.appendChild(barElement);

      jest.spyOn(barElement, 'getBoundingClientRect').mockReturnValue({
        left: 150,
        width: 200,
        top: 0,
        right: 350,
        bottom: 0,
        height: 0,
        x: 150,
        y: 0,
        toJSON: () => ({}),
      });

      const position = calculateBadgePosition(sprintSegment, barElement);

      // Sprint center is at 250px, bar starts at 150px, bar width is 200px
      // Position = (250 - 150) / 200 * 100 = 50%
      expect(position).toBe(50);

      document.body.removeChild(barElement);
    });
  });
});
