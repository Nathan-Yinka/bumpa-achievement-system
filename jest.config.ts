import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.base.json' }],
  },
  collectCoverageFrom: ['apps/**/*.ts', 'packages/**/*.ts', '!**/*.module.ts', '!**/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@bumpa/events-sdk$': '<rootDir>/packages/events-sdk/src',
    '^@bumpa/logger-sdk$': '<rootDir>/packages/logger-sdk/src',
    '^@bumpa/config-sdk$': '<rootDir>/packages/config-sdk/src',
  },
};

export default config;
