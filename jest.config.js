module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.spec.ts',
    '**/?(*.)+(spec|test).ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    'extension-structure.test.ts',  // Post-build validation test, not source code test
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/background/**',  // Service worker - browser integration, not unit testable
    '!src/popup/**',        // Popup UI - browser integration, not unit testable
    '!src/__tests__/**',    // Test setup files
  ],
  // Coverage thresholds disabled until we have reliable baseline
  // coverageThreshold: {
  //   global: {
  //     branches: 37,
  //     functions: 65,
  //     lines: 56,
  //     statements: 56,
  //   },
  // },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      },
    }],
  },
};
