import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Relax some strict checks for test environment
        noEmit: false,
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  // Don't run coverage on node_modules
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    '!src/lib/**/*.d.ts',
  ],
  // Longer timeout for LLM calls
  testTimeout: 30000,
};

export default config;
