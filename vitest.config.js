import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
            exclude: [
                'node_modules/**',
                'tests/**',
                '*.config.js',
                'scripts/**',
                'test-*.js',
                'diagnose-*.js',
                'find-*.js',
                'identify-*.js',
                'monitor-*.js',
                'probe-*.js',
                'reconfigure-*.js',
                'scan-*.js',
                'add_*.js',
                'check_*.js',
                'sockets/**',
                'sounds/**',
                'uploads/**'
            ],
            include: [
                'routes/**/*.js',
                'services/**/*.js',
                'middleware/**/*.js',
                'models/**/*.js',
                'login/**/*.js'
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80
            }
        },
        testTimeout: 10000,
        hookTimeout: 10000,
        // Separate integration tests
        include: ['tests/**/*.test.js'],
        exclude: ['tests/integration/**/*.test.js']
    }
});

