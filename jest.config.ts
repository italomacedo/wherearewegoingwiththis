import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@scenes/(.*)$': '<rootDir>/src/scenes/$1',
    '^@entities/(.*)$': '<rootDir>/src/entities/$1',
    '^@systems/(.*)$': '<rootDir>/src/systems/$1',
    '^@ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@assets/(.*)$': '<rootDir>/src/assets/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
      },
    ],
    // Transform ESM JS files in @babylonjs packages using babel
    '^.+\\.m?js$': 'babel-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    'electron/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/vite-env.d.ts',
    // Scene-Editor GUI glue: carries `istanbul ignore file`, but the pragma is
    // not honored for this file in the never-imported coverage pass (unlike its
    // siblings) — excluded here explicitly. Pure editor logic is fully tested.
    '!src/systems/sceneeditor/EditorPanels.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 95,
      functions: 95,
      branches: 90,
      statements: 95,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  // Babylon.js modules need special handling in Jest (they're ESM)
  transformIgnorePatterns: [
    'node_modules/(?!(@babylonjs)/)',
  ],
};

export default config;
