# CRM Backend

[![Tests](https://github.com/DineshMurugan2022/projectcrm/actions/workflows/test.yml/badge.svg)](https://github.com/DineshMurugan2022/projectcrm/actions/workflows/test.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

A comprehensive CRM backend built with Node.js, Express, MongoDB, and Socket.IO with real-time capabilities, modem integration, and extensive testing.

## 🚀 Features

### Core Modules
- **Authentication & Authorization** - JWT-based auth with role-based access control
- **User Management** - Complete CRUD operations for users with role management
- **Appointments** - Schedule and manage appointments with calendar integration
- **Tasks** - Task assignment, tracking, and priority management
- **Leads** - Lead management, conversion tracking, and pipeline management
- **Messages** - Real-time messaging with Socket.IO and file uploads
- **Attendance** - Employee attendance tracking with auto-logout and live location
- **Reports** - Comprehensive reporting for all modules with Excel/PDF export
- **Calls** - VoIP call logging, statistics, and Huawei E173 modem integration
- **Queries** - Customer query management and tracking

### Advanced Features
- **Real-time Communication** - Socket.IO for live updates
- **Modem Integration** - Huawei E173 modem for voice calls
- **File Uploads** - Multer-based file handling
- **Caching** - Redis caching for performance
- **Rate Limiting** - API rate limiting with Redis
- **Security** - Helmet, XSS protection, input validation
- **Cron Jobs** - Automated attendance logout and scheduled tasks

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
- **Caching:** Redis
- **Testing:** Vitest + Supertest + MongoDB Memory Server
- **Linting:** ESLint
- **Security:** Helmet, express-validator, XSS
- **Hardware:** SerialPort, node-hid, usb (for modem integration)

## 📦 Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start MongoDB (if running locally)
mongod

# Start Redis (if using caching)
redis-server

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
SESSION_SECRET=your-session-secret-here

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3000

# Redis (optional - for caching and rate limiting)
REDIS_URL=redis://localhost:6379

# File Uploads
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# Twilio (optional - for SMS/calls)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# Modem Configuration (optional - for Huawei E173)
MODEM_PORT=COM12
MODEM_AUDIO_PORT=COM13
```

## 🏗️ Project Structure

```
backend/
├── config/              # Configuration files
│   ├── redis.js        # Redis configuration
│   └── database.js     # Database configuration
├── login/               # Authentication logic
├── middleware/          # Express middleware
│   ├── auth.js         # JWT authentication
│   ├── cache.js        # Redis caching
│   ├── rateLimiter.js  # Rate limiting
│   ├── errorHandler.js # Error handling
│   ├── upload.js       # File upload handling
│   └── validator.js    # Input validation
├── models/              # Mongoose models
│   ├── User.js
│   ├── Lead.js
│   ├── Task.js
│   ├── Appointment.js
│   ├── Message.js
│   ├── Attendance.js
│   ├── Call.js
│   ├── Query.js
│   └── Report.js
├── routes/              # API routes
│   ├── userRoutes.js
│   ├── leads.js
│   ├── tasks.js
│   ├── appointments.js
│   ├── messages.js
│   ├── attendance.js
│   ├── calls.js
│   ├── queries.js
│   └── reports.js
├── services/            # Business logic
│   ├── attendanceService.js
│   ├── callService.js
│   ├── modemService.js
│   ├── cronService.js
│   └── exportService.js
├── sockets/             # Socket.IO handlers
│   ├── messageHandler.js
│   ├── callHandler.js
│   └── notificationHandler.js
├── tests/               # Test files
│   ├── api/            # API endpoint tests
│   ├── integration/    # Integration tests
│   ├── middleware/     # Middleware tests
│   ├── services/       # Service tests
│   └── setup.js        # Test configuration
├── uploads/             # File uploads directory
├── scripts/             # Utility scripts
├── server.js            # Entry point
├── db.js                # Database connection
├── vitest.config.js     # Test configuration
└── package.json         # Dependencies
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/register` - User registration
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user (admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin only)

### Appointments
- `GET /api/appointments` - Get appointments
- `GET /api/appointments/:id` - Get appointment by ID
- `POST /api/appointments` - Create appointment
- `PUT /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Delete appointment
- `GET /api/appointments/calendar` - Get calendar view

### Tasks
- `GET /api/tasks` - Get tasks
- `GET /api/tasks/:id` - Get task by ID
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PUT /api/tasks/:id/status` - Update task status

### Leads
- `GET /api/leads` - Get leads
- `GET /api/leads/:id` - Get lead by ID
- `POST /api/leads` - Create lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead
- `PUT /api/leads/:id/convert` - Convert lead to customer

### Messages
- `GET /api/messages/:userId` - Get conversation with user
- `POST /api/messages` - Send message
- `POST /api/messages/upload` - Upload file
- `GET /api/messages/unread-count` - Get unread message count
- `PUT /api/messages/read/:userId` - Mark messages as read

### Attendance
- `GET /api/attendance` - Get attendance records
- `POST /api/attendance/login` - Record login
- `POST /api/attendance/logout` - Record logout
- `GET /api/attendance/summary` - Get attendance summary
- `GET /api/attendance/user/:userId` - Get user attendance
- `POST /api/attendance/manual` - Manual attendance entry (admin)

### Reports
- `GET /api/reports/attendance` - Attendance report
- `GET /api/reports/tasks` - Task completion report
- `GET /api/reports/leads` - Lead conversion report
- `GET /api/reports/calls` - Call statistics report
- `POST /api/reports/export` - Export report (Excel/PDF)

### Calls
- `GET /api/calls` - Get calls
- `GET /api/calls/:id` - Get call by ID
- `POST /api/calls` - Initiate call
- `PUT /api/calls/:id` - Update call
- `GET /api/calls/history` - Call history
- `GET /api/calls/stats` - Call statistics

### Queries
- `GET /api/queries` - Get queries
- `GET /api/queries/:id` - Get query by ID
- `POST /api/queries` - Create query
- `PUT /api/queries/:id` - Update query
- `DELETE /api/queries/:id` - Delete query
- `PUT /api/queries/:id/resolve` - Resolve query

## 🔒 Security

- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt with salt rounds
- **Helmet.js** - Security headers
- **Rate Limiting** - Prevent brute force attacks
- **CORS** - Configured allowed origins
- **Input Validation** - express-validator
- **XSS Protection** - Sanitize user input
- **Session Management** - Secure session handling

## 🎯 Modem Integration

The backend supports Huawei E173 modem for voice calls:

### Features
- Voice call initiation via AT commands
- Call status monitoring
- Audio routing through Mobile Partner
- Call logging and history
- Diagnostic tools for modem troubleshooting

### Testing Scripts
```bash
# Test modem connection
node test-modem.js

# Test call functionality
node test-standalone.js

# Monitor modem status
node monitor-modem.js

# Scan available ports
node scan-ports.js
```

## 📡 Real-time Features

Socket.IO events:
- `message:new` - New message received
- `message:read` - Message read status
- `call:incoming` - Incoming call
- `call:status` - Call status update
- `notification:new` - New notification
- `attendance:update` - Attendance update
- `task:assigned` - Task assignment

## 🚀 Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name crm-backend

# View logs
pm2 logs crm-backend

# Monitor
pm2 monit

# Restart
pm2 restart crm-backend

# Stop
pm2 stop crm-backend
```

### Using Docker

```bash
# Build image
docker build -t crm-backend .

# Run container
docker run -p 5000:5000 --env-file .env crm-backend

# With Docker Compose
docker-compose up -d
```

### Environment-specific Deployment

```bash
# Production
NODE_ENV=production npm start

# Staging
NODE_ENV=staging npm start
```

## 📈 CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **Automated Testing** - Runs on every push and pull request
- **Multi-Node Testing** - Tests on Node.js 18.x and 20.x
- **Coverage Reports** - Automatically generated and uploaded
- **Linting** - Code quality checks
- **Build Verification** - Ensures successful builds

See `.github/workflows/test.yml` for the complete CI/CD configuration.

## 🔧 Utility Scripts

```bash
# Kill process on port 5000
npm run kill-port

# Restart server
npm run restart

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

## 📊 Performance Optimization

- **Redis Caching** - Cache frequently accessed data
- **Database Indexing** - Optimized MongoDB indexes
- **Connection Pooling** - Efficient database connections
- **Compression** - Response compression
- **Rate Limiting** - Prevent API abuse

## 🐛 Debugging

Enable debug mode:
```bash
DEBUG=* npm run dev
```

View detailed logs:
```bash
NODE_ENV=development npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 👥 Authors

- Dinesh Murugan - Initial work

## 🙏 Acknowledgments

- Express.js team
- MongoDB team
- Socket.IO team
- Vitest team
- All open-source contributors

---

**Built with 💻 using Node.js and Express**
