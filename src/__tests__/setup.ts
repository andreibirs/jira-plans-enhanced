/**
 * Jest Test Setup
 *
 * Mocks Chrome Extension APIs for testing
 */

// Mock Chrome APIs
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    sendMessage: jest.fn(),
  } as any,
  storage: {
    sync: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      clear: jest.fn((callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  } as any,
  tabs: {
    query: jest.fn((queryInfo, callback) => {
      if (callback) callback([]);
      return Promise.resolve([]);
    }),
    sendMessage: jest.fn(),
  } as any,
} as any;

// Note: jsdom provides window.location by default, no need to mock it

// Mock AbortController if not available
if (typeof AbortController === 'undefined') {
  global.AbortController = class AbortController {
    signal = { aborted: false };
    abort() {
      this.signal.aborted = true;
    }
  } as any;
}
