/**
 * Message Protocol for Popup ↔ Content Script Communication
 *
 * Defines typed messages for safe communication between the popup UI
 * and the content script running on Jira Plans pages.
 */

import { ExtensionStatistics } from './statistics';

/**
 * Messages sent from Popup to Content Script
 */
export type PopupRequest =
  | { type: 'GET_STATISTICS' }
  | { type: 'CLEAR_CACHE'; epicKey?: string }
  | { type: 'REFRESH_CACHE'; forceRefresh: boolean };

/**
 * Messages sent from Content Script to Popup
 */
export type PopupResponse =
  | { type: 'GET_STATISTICS_RESPONSE'; success: true; statistics: ExtensionStatistics }
  | { type: 'CLEAR_CACHE_RESPONSE'; success: true; clearedCount: number }
  | { type: 'REFRESH_CACHE_RESPONSE'; success: true; refreshedCount: number }
  | { type: string; success: false; error: string };

/**
 * Type guard to check if a message is a valid PopupRequest
 */
export function isPopupRequest(message: unknown): message is PopupRequest {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as { type?: string };
  const validTypes = [
    'GET_STATISTICS',
    'CLEAR_CACHE',
    'REFRESH_CACHE',
  ];

  return typeof msg.type === 'string' && validTypes.includes(msg.type);
}

/**
 * Type guard to check if a response indicates success
 */
export function isSuccessResponse(response: PopupResponse): response is Extract<PopupResponse, { success: true }> {
  return response.success === true;
}

/**
 * Type guard to check if a response indicates failure
 */
export function isErrorResponse(response: PopupResponse): response is Extract<PopupResponse, { success: false }> {
  return response.success === false;
}
