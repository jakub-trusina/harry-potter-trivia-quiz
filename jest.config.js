/** @type {import('jest').Config} */
export default {
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            useESM: true,
        }]
    },
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^(\\.{1,2}/.*)\\.ts$': '$1'
    },
    testEnvironment: 'node',
    testTimeout: 10000, // Reduce timeout to catch hanging tests faster
    setupFilesAfterEnv: ['./tests/setup.ts'],
    moduleFileExtensions: ['js', 'ts'],
    testMatch: ['**/*.test.ts'],
    preset: 'ts-jest/presets/default-esm',
    detectOpenHandles: true, // Help identify leaking resources
    forceExit: true, // Force exit after tests complete
    maxWorkers: 1, // Run tests sequentially to avoid port conflicts
}; 