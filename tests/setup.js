// Test setup file - MUST be loaded before any tests
// Set environment variables FIRST before any imports
process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-only';
process.env.MONGODB_URI = 'mongodb://localhost:27017/crm-test';
process.env.PORT = '5001';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

import { beforeAll, afterAll, afterEach } from 'vitest';

// Global test setup
beforeAll(() => {
    console.log('🧪 Starting test suite...');
    console.log('JWT_SECRET is set:', !!process.env.JWT_SECRET);
});

afterAll(() => {
    console.log('✅ Test suite completed');
});

afterEach(() => {
    // Clear all mocks after each test
    if (typeof vi !== 'undefined') {
        vi.clearAllMocks();
    }
});
