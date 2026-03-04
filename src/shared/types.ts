/**
 * Shared type definitions for message passing between content script and service worker
 *
 * This module defines the contract for communication in Jira Plans Enhanced.
 * All types are strictly typed to ensure type safety across the Chrome extension architecture.
 *
 * @module shared/types
 */

/**
 * Data source indicator for headcount information
 *
 * - ESTIMATE: DOM-derived approximation (visible assignees only)
 * - CACHED: Recently fetched API data (< 5 minutes old)
 * - LIVE: Fresh data from Jira API
 */
export enum DataSource {
  ESTIMATE = 'ESTIMATE',
  CACHED = 'CACHED',
  LIVE = 'LIVE'
}

/**
 * Request message to get headcount for an epic across specified sprints
 */
export interface GetHeadcountRequest {
  type: 'GET_HEADCOUNT';
  epicKey: string;
  sprintIds: number[];
}

/**
 * Headcount data including assignee information and data provenance
 */
export interface HeadcountData {
  epicKey: string;
  count: number;
  assignees: string[];
  source: DataSource;
  timestamp: number;
}

/**
 * Successful response containing headcount data
 */
export interface GetHeadcountResponse {
  type: 'GET_HEADCOUNT_RESPONSE';
  success: true;
  data: HeadcountData;
}

/**
 * Error information with optional details
 */
export interface ErrorInfo {
  message: string;
  code: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
}

/**
 * Error response when headcount request fails
 */
export interface ErrorResponse {
  type: 'GET_HEADCOUNT_RESPONSE';
  success: false;
  error: ErrorInfo;
  data?: never;
}

/**
 * Union type for all possible responses
 */
export type HeadcountResponse = GetHeadcountResponse | ErrorResponse;

/**
 * Jira assignee information from API response
 */
export interface JiraAssignee {
  emailAddress: string;
  displayName: string;
}

/**
 * Jira issue fields from API response
 */
export interface JiraIssueFields {
  assignee: JiraAssignee | null;
  summary?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Jira issue from API search response
 */
export interface JiraIssueResponse {
  key: string;
  fields: JiraIssueFields;
}

/**
 * Jira search API response structure
 */
export interface JiraSearchResponse {
  issues: JiraIssueResponse[];
  total: number;
}

/**
 * Type guard to check if a message is a GetHeadcountRequest
 *
 * @param message - The message to check
 * @returns True if message is a valid GetHeadcountRequest
 */
export function isGetHeadcountRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any
): message is GetHeadcountRequest {
  return (
    message !== null &&
    message !== undefined &&
    typeof message === 'object' &&
    message.type === 'GET_HEADCOUNT' &&
    typeof message.epicKey === 'string' &&
    Array.isArray(message.sprintIds)
  );
}

/**
 * Type guard to check if a response is a GetHeadcountResponse (success or error)
 *
 * @param response - The response to check
 * @returns True if response is a valid GetHeadcountResponse or ErrorResponse
 */
export function isGetHeadcountResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any
): response is HeadcountResponse {
  return (
    response !== null &&
    response !== undefined &&
    typeof response === 'object' &&
    response.type === 'GET_HEADCOUNT_RESPONSE' &&
    typeof response.success === 'boolean'
  );
}

/**
 * Type guard to check if a response is an ErrorResponse
 *
 * @param response - The response to check
 * @returns True if response is a valid ErrorResponse
 */
export function isErrorResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any
): response is ErrorResponse {
  return (
    isGetHeadcountResponse(response) &&
    response.success === false &&
    response.error !== undefined &&
    typeof response.error === 'object' &&
    typeof response.error.message === 'string' &&
    typeof response.error.code === 'string'
  );
}
