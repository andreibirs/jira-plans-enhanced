/**
 * Tests for Message Protocol
 *
 * Tests message type guards and validation
 */

import { isPopupRequest, isSuccessResponse, isErrorResponse } from './messages';
import type { PopupResponse } from './messages';
import { INITIAL_STATISTICS } from './statistics';

describe('Messages', () => {
  describe('isPopupRequest', () => {
    it('should validate GET_STATISTICS request', () => {
      const validRequest = { type: 'GET_STATISTICS' };
      expect(isPopupRequest(validRequest)).toBe(true);
    });

    it('should validate CLEAR_CACHE request without epicKey', () => {
      const validRequest = { type: 'CLEAR_CACHE' };
      expect(isPopupRequest(validRequest)).toBe(true);
    });

    it('should validate CLEAR_CACHE request with epicKey', () => {
      const validRequest = { type: 'CLEAR_CACHE', epicKey: 'GS-123' };
      expect(isPopupRequest(validRequest)).toBe(true);
    });

    it('should validate REFRESH_CACHE request', () => {
      const validRequest = { type: 'REFRESH_CACHE', forceRefresh: true };
      expect(isPopupRequest(validRequest)).toBe(true);
    });

    it('should reject invalid request types', () => {
      const invalidRequest = { type: 'INVALID_TYPE' };
      expect(isPopupRequest(invalidRequest)).toBe(false);
    });

    it('should reject null and undefined', () => {
      expect(isPopupRequest(null)).toBe(false);
      expect(isPopupRequest(undefined)).toBe(false);
      expect(isPopupRequest({})).toBe(false);
    });

    it('should reject non-object values', () => {
      expect(isPopupRequest('string')).toBe(false);
      expect(isPopupRequest(123)).toBe(false);
      expect(isPopupRequest([])).toBe(false);
    });
  });

  describe('isSuccessResponse', () => {
    it('should identify successful GET_STATISTICS response', () => {
      const successResponse: PopupResponse = {
        type: 'GET_STATISTICS_RESPONSE',
        success: true,
        statistics: INITIAL_STATISTICS,
      };
      expect(isSuccessResponse(successResponse)).toBe(true);
    });

    it('should identify successful CLEAR_CACHE response', () => {
      const successResponse: PopupResponse = {
        type: 'CLEAR_CACHE_RESPONSE',
        success: true,
        clearedCount: 5,
      };
      expect(isSuccessResponse(successResponse)).toBe(true);
    });

    it('should identify successful REFRESH_CACHE response', () => {
      const successResponse: PopupResponse = {
        type: 'REFRESH_CACHE_RESPONSE',
        success: true,
        refreshedCount: 10,
      };
      expect(isSuccessResponse(successResponse)).toBe(true);
    });

    it('should reject error responses', () => {
      const errorResponse: PopupResponse = {
        type: 'ERROR',
        success: false,
        error: 'Something went wrong',
      };
      expect(isSuccessResponse(errorResponse)).toBe(false);
    });
  });

  describe('isErrorResponse', () => {
    it('should identify error responses', () => {
      const errorResponse: PopupResponse = {
        type: 'ERROR',
        success: false,
        error: 'Something went wrong',
      };
      expect(isErrorResponse(errorResponse)).toBe(true);
    });

    it('should reject success responses', () => {
      const successResponse: PopupResponse = {
        type: 'GET_STATISTICS_RESPONSE',
        success: true,
        statistics: INITIAL_STATISTICS,
      };
      expect(isErrorResponse(successResponse)).toBe(false);
    });
  });
});
