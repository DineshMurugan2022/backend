# Backend Test Suite

This directory contains comprehensive tests for the CRM backend API.

## Test Structure

```
tests/
├── setup.js                    # Global test configuration
├── api/                        # API endpoint tests
│   ├── auth.test.js           # Authentication endpoints
│   ├── users.test.js          # User management
│   ├── appointments.test.js   # Appointment management
│   ├── tasks.test.js          # Task management
│   └── leads.test.js          # Lead management
├── services/                   # Service layer tests
│   └── attendanceService.test.js
└── middleware/                 # Middleware tests
    └── auth.test.js           # Auth middleware

```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run specific test file
```bash
npx vitest run tests/api/auth.test.js
```

## Test Coverage

The test suite covers:

### API Endpoints
- ✅ Authentication (login, token validation)
- ✅ User management (CRUD operations)
- ✅ Appointments (CRUD, filtering)
- ✅ Tasks (CRUD, status management)
- ✅ Leads (CRUD, validation)

### Services
- ✅ Attendance tracking (login/logout, statistics)

### Middleware
- ✅ Authentication middleware
- ✅ Token validation
- ✅ Authorization levels

## Writing New Tests

When adding new tests:

1. Create test file in appropriate directory
2. Use descriptive test names
3. Mock external dependencies
4. Test both success and error cases
5. Clean up mocks in `beforeEach`

Example:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

## Mocking

We use Vitest's mocking capabilities:

```javascript
// Mock a module
vi.mock('../../models/User');

// Mock a function
const mockFn = vi.fn().mockResolvedValue(data);

// Clear mocks
vi.clearAllMocks();
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Clarity**: Use descriptive test names
3. **Coverage**: Test both happy path and edge cases
4. **Speed**: Keep tests fast by mocking I/O operations
5. **Maintainability**: Keep tests simple and readable
