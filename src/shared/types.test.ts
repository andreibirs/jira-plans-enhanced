/**
 * Test suite for shared type definitions
 *
 * These tests verify that our TypeScript types are correctly structured
 * and provide proper type safety for message passing between content script
 * and service worker.
 */

import {
  DataSource,
  GetHeadcountRequest,
  GetHeadcountResponse,
  ErrorResponse,
  HeadcountData,
  JiraIssueResponse,
  JiraSearchResponse,
  isGetHeadcountRequest,
  isGetHeadcountResponse,
  isErrorResponse
} from './types';

describe('Shared Types', () => {
  describe('DataSource enum', () => {
    it('should define ESTIMATE data source', () => {
      expect(DataSource.ESTIMATE).toBe('ESTIMATE');
    });

    it('should define CACHED data source', () => {
      expect(DataSource.CACHED).toBe('CACHED');
    });

    it('should define LIVE data source', () => {
      expect(DataSource.LIVE).toBe('LIVE');
    });

    it('should have exactly 3 values', () => {
      const values = Object.values(DataSource);
      expect(values).toHaveLength(3);
    });
  });

  describe('GetHeadcountRequest', () => {
    it('should accept valid request with epicKey and sprintIds', () => {
      const request: GetHeadcountRequest = {
        type: 'GET_HEADCOUNT',
        epicKey: 'EPIC-123',
        sprintIds: [1, 2, 3]
      };

      expect(request.type).toBe('GET_HEADCOUNT');
      expect(request.epicKey).toBe('EPIC-123');
      expect(request.sprintIds).toEqual([1, 2, 3]);
    });

    it('should accept empty sprint IDs array', () => {
      const request: GetHeadcountRequest = {
        type: 'GET_HEADCOUNT',
        epicKey: 'EPIC-456',
        sprintIds: []
      };

      expect(request.sprintIds).toEqual([]);
    });
  });

  describe('HeadcountData', () => {
    it('should accept valid headcount data with ESTIMATE source', () => {
      const data: HeadcountData = {
        epicKey: 'EPIC-123',
        count: 5,
        assignees: ['user1@example.com', 'user2@example.com'],
        source: DataSource.ESTIMATE,
        timestamp: Date.now()
      };

      expect(data.count).toBe(5);
      expect(data.source).toBe(DataSource.ESTIMATE);
      expect(data.assignees).toHaveLength(2);
    });

    it('should accept valid headcount data with CACHED source', () => {
      const data: HeadcountData = {
        epicKey: 'EPIC-456',
        count: 3,
        assignees: ['user3@example.com'],
        source: DataSource.CACHED,
        timestamp: Date.now()
      };

      expect(data.source).toBe(DataSource.CACHED);
    });

    it('should accept valid headcount data with LIVE source', () => {
      const data: HeadcountData = {
        epicKey: 'EPIC-789',
        count: 7,
        assignees: [],
        source: DataSource.LIVE,
        timestamp: Date.now()
      };

      expect(data.source).toBe(DataSource.LIVE);
    });

    it('should allow zero count', () => {
      const data: HeadcountData = {
        epicKey: 'EPIC-000',
        count: 0,
        assignees: [],
        source: DataSource.LIVE,
        timestamp: Date.now()
      };

      expect(data.count).toBe(0);
    });
  });

  describe('GetHeadcountResponse', () => {
    it('should accept successful response with data', () => {
      const response: GetHeadcountResponse = {
        type: 'GET_HEADCOUNT_RESPONSE',
        success: true,
        data: {
          epicKey: 'EPIC-123',
          count: 5,
          assignees: ['user1@example.com'],
          source: DataSource.LIVE,
          timestamp: Date.now()
        }
      };

      expect(response.success).toBe(true);
      expect(response.data?.count).toBe(5);
    });

    it('should accept response with CACHED data source', () => {
      const response: GetHeadcountResponse = {
        type: 'GET_HEADCOUNT_RESPONSE',
        success: true,
        data: {
          epicKey: 'EPIC-456',
          count: 3,
          assignees: [],
          source: DataSource.CACHED,
          timestamp: Date.now() - 60000 // 1 minute old
        }
      };

      expect(response.data?.source).toBe(DataSource.CACHED);
    });
  });

  describe('ErrorResponse', () => {
    it('should accept error response with message and code', () => {
      const response: ErrorResponse = {
        type: 'GET_HEADCOUNT_RESPONSE',
        success: false,
        error: {
          message: 'Epic not found',
          code: 'EPIC_NOT_FOUND'
        }
      };

      expect(response.success).toBe(false);
      expect(response.error?.message).toBe('Epic not found');
      expect(response.error?.code).toBe('EPIC_NOT_FOUND');
      expect(response.data).toBeUndefined();
    });

    it('should accept error response with optional details', () => {
      const response: ErrorResponse = {
        type: 'GET_HEADCOUNT_RESPONSE',
        success: false,
        error: {
          message: 'API timeout',
          code: 'TIMEOUT',
          details: {
            epicKey: 'EPIC-999',
            timeout: 5000
          }
        }
      };

      expect(response.error?.details).toBeDefined();
      expect(response.error?.details?.timeout).toBe(5000);
    });
  });

  describe('JiraIssueResponse', () => {
    it('should accept valid Jira issue with assignee', () => {
      const issue: JiraIssueResponse = {
        key: 'STORY-123',
        fields: {
          assignee: {
            emailAddress: 'engineer@example.com',
            displayName: 'Engineer Name'
          }
        }
      };

      expect(issue.key).toBe('STORY-123');
      expect(issue.fields.assignee?.emailAddress).toBe('engineer@example.com');
    });

    it('should accept issue with null assignee', () => {
      const issue: JiraIssueResponse = {
        key: 'STORY-456',
        fields: {
          assignee: null
        }
      };

      expect(issue.fields.assignee).toBeNull();
    });

    it('should accept issue with summary field', () => {
      const issue: JiraIssueResponse = {
        key: 'STORY-789',
        fields: {
          summary: 'Implement feature X',
          assignee: null
        }
      };

      expect(issue.fields.summary).toBe('Implement feature X');
    });
  });

  describe('JiraSearchResponse', () => {
    it('should accept valid search response with issues', () => {
      const response: JiraSearchResponse = {
        issues: [
          {
            key: 'STORY-1',
            fields: {
              assignee: {
                emailAddress: 'user1@example.com',
                displayName: 'User 1'
              }
            }
          },
          {
            key: 'STORY-2',
            fields: {
              assignee: null
            }
          }
        ],
        total: 2
      };

      expect(response.issues).toHaveLength(2);
      expect(response.total).toBe(2);
    });

    it('should accept empty search response', () => {
      const response: JiraSearchResponse = {
        issues: [],
        total: 0
      };

      expect(response.issues).toHaveLength(0);
      expect(response.total).toBe(0);
    });
  });

  describe('Type guards', () => {
    describe('isGetHeadcountRequest', () => {
      it('should return true for valid request', () => {
        const request = {
          type: 'GET_HEADCOUNT',
          epicKey: 'EPIC-123',
          sprintIds: [1, 2]
        };

        expect(isGetHeadcountRequest(request)).toBe(true);
      });

      it('should return false for invalid type', () => {
        const request = {
          type: 'INVALID_TYPE',
          epicKey: 'EPIC-123',
          sprintIds: []
        };

        expect(isGetHeadcountRequest(request)).toBe(false);
      });

      it('should return false for missing epicKey', () => {
        const request = {
          type: 'GET_HEADCOUNT',
          sprintIds: []
        };

        expect(isGetHeadcountRequest(request)).toBe(false);
      });

      it('should return false for missing sprintIds', () => {
        const request = {
          type: 'GET_HEADCOUNT',
          epicKey: 'EPIC-123'
        };

        expect(isGetHeadcountRequest(request)).toBe(false);
      });

      it('should return false for non-array sprintIds', () => {
        const request = {
          type: 'GET_HEADCOUNT',
          epicKey: 'EPIC-123',
          sprintIds: 'not-an-array'
        };

        expect(isGetHeadcountRequest(request)).toBe(false);
      });

      it('should return false for null', () => {
        expect(isGetHeadcountRequest(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isGetHeadcountRequest(undefined)).toBe(false);
      });
    });

    describe('isGetHeadcountResponse', () => {
      it('should return true for valid success response', () => {
        const response = {
          type: 'GET_HEADCOUNT_RESPONSE',
          success: true,
          data: {
            epicKey: 'EPIC-123',
            count: 5,
            assignees: [],
            source: DataSource.LIVE,
            timestamp: Date.now()
          }
        };

        expect(isGetHeadcountResponse(response)).toBe(true);
      });

      it('should return false for invalid type', () => {
        const response = {
          type: 'INVALID_RESPONSE',
          success: true,
          data: {}
        };

        expect(isGetHeadcountResponse(response)).toBe(false);
      });

      it('should return false for missing success field', () => {
        const response = {
          type: 'GET_HEADCOUNT_RESPONSE',
          data: {}
        };

        expect(isGetHeadcountResponse(response)).toBe(false);
      });

      it('should return true for error response without data', () => {
        const response = {
          type: 'GET_HEADCOUNT_RESPONSE',
          success: false,
          error: {
            message: 'Error',
            code: 'ERROR'
          }
        };

        expect(isGetHeadcountResponse(response)).toBe(true);
      });
    });

    describe('isErrorResponse', () => {
      it('should return true for valid error response', () => {
        const response = {
          type: 'GET_HEADCOUNT_RESPONSE',
          success: false,
          error: {
            message: 'Error occurred',
            code: 'ERROR_CODE'
          }
        };

        expect(isErrorResponse(response)).toBe(true);
      });

      it('should return false for success response', () => {
        const response = {
          type: 'GET_HEADCOUNT_RESPONSE',
          success: true,
          data: {}
        };

        expect(isErrorResponse(response)).toBe(false);
      });

      it('should return false for error response without error object', () => {
        const response = {
          type: 'GET_HEADCOUNT_RESPONSE',
          success: false
        };

        expect(isErrorResponse(response)).toBe(false);
      });

      it('should return false for error object missing message', () => {
        const response = {
          type: 'GET_HEADCOUNT_RESPONSE',
          success: false,
          error: {
            code: 'ERROR_CODE'
          }
        };

        expect(isErrorResponse(response)).toBe(false);
      });
    });
  });
});
