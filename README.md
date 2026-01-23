# CRM Backend

[![Tests](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/test.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/YOUR_REPO/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/YOUR_REPO)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

A comprehensive CRM backend built with Node.js, Express, and MongoDB.

## 🚀 Features

- **Authentication & Authorization** - JWT-based auth with role-based access control
- **User Management** - Complete CRUD operations for users
- **Appointments** - Schedule and manage appointments
- **Tasks** - Task assignment and tracking
- **Leads** - Lead management and conversion tracking
- **Messages** - Real-time messaging with Socket.IO
- **Attendance** - Employee attendance tracking with auto-logout
- **Reports** - Comprehensive reporting for all modules
- **Calls** - Call logging and statistics
- **Queries** - Customer query management

## 📊 Test Coverage

- **Total Tests:** 90+ tests
- **Unit Tests:** 47 tests
- **Integration Tests:** 15+ tests
- **Coverage:** 80%+ (lines, functions, branches, statements)

## 🛠️ Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose
- **Authentication:** JWT + bcrypt
- **Real-time:** Socket.IO
- **Testing:** Vitest + Supertest
- **Linting:** ESLint

## 📦 Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start development server
npm run dev
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration

# Run all tests (unit + integration)
npm run test:all

# Generate coverage report
npm run test:coverage

# View coverage in browser
npm run test:coverage:ui
```

## 📝 Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/crm

# Authentication
JWT_SECRET=your-secret-key-here

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

## 🏗️ Project Structure

```
backend/
├── config/           # Configuration files
├── login/            # Authentication logic
├── middleware/       # Express middleware
├── models/           # Mongoose models
├── routes/           # API routes
├── services/         # Business logic
├── sockets/          # Socket.IO handlers
├── tests/            # Test files
│   ├── api/         # API endpoint tests
│   ├── integration/ # Integration tests
│   ├── middleware/  # Middleware tests
│   └── services/    # Service tests
├── uploads/          # File uploads
├── server.js         # Entry point
└── package.json      # Dependencies
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/register` - User registration

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Appointments
- `GET /api/appointments` - Get appointments
- `POST /api/appointments` - Create appointment
- `PUT /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Delete appointment

### Tasks
- `GET /api/tasks` - Get tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Leads
- `GET /api/leads` - Get leads
- `POST /api/leads` - Create lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead

### Messages
- `GET /api/messages/:userId` - Get conversation
- `POST /api/messages` - Send message
- `GET /api/messages/unread-count` - Get unread count
- `PUT /api/messages/read/:userId` - Mark as read

### Attendance
- `GET /api/attendance` - Get attendance records
- `POST /api/attendance/login` - Record login
- `POST /api/attendance/logout` - Record logout
- `GET /api/attendance/summary` - Get summary

### Reports
- `GET /api/reports/attendance` - Attendance report
- `GET /api/reports/tasks` - Task report
- `GET /api/reports/leads` - Lead report
- `POST /api/reports/export` - Export report

### Calls
- `GET /api/calls` - Get calls
- `POST /api/calls` - Initiate call
- `PUT /api/calls/:id` - Update call
- `GET /api/calls/history` - Call history
- `GET /api/calls/stats` - Call statistics

### Queries
- `GET /api/queries` - Get queries
- `POST /api/queries` - Create query
- `PUT /api/queries/:id` - Update query
- `DELETE /api/queries/:id` - Delete query

## 🔒 Security

- JWT-based authentication
- Password hashing with bcrypt
- Helmet.js for security headers
- Rate limiting
- CORS configuration
- Input validation
- XSS protection

## 🚀 Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name crm-backend

# View logs
pm2 logs crm-backend

# Restart
pm2 restart crm-backend
```

### Using Docker

```bash
# Build image
docker build -t crm-backend .

# Run container
docker run -p 5000:5000 --env-file .env crm-backend
```

## 📈 CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **Automated Testing** - Runs on every push and pull request
- **Multi-Node Testing** - Tests on Node.js 18.x and 20.x
- **Coverage Reports** - Automatically generated and uploaded
- **Linting** - Code quality checks

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 👥 Authors

- Your Name - Initial work

## 🙏 Acknowledgments

- Express.js team
- MongoDB team
- Vitest team
- All contributors

---

**Note:** Replace `YOUR_USERNAME` and `YOUR_REPO` in the badge URLs with your actual GitHub username and repository name.
