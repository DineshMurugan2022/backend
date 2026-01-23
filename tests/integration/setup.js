import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

let mongoServer;

// Setup MongoDB Memory Server before all tests
beforeAll(async () => {
    console.log('🔧 Starting MongoDB Memory Server...');

    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri);

    console.log('✅ MongoDB Memory Server started');
    console.log(`📍 URI: ${mongoUri}`);
});

// Cleanup after each test
afterEach(async () => {
    const collections = mongoose.connection.collections;

    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
});

// Cleanup after all tests
afterAll(async () => {
    console.log('🧹 Cleaning up MongoDB Memory Server...');

    await mongoose.disconnect();
    await mongoServer.stop();

    console.log('✅ MongoDB Memory Server stopped');
});

// Helper function to create test user
export async function createTestUser(userData = {}) {
    const User = (await import('../../models/User')).default;
    const bcrypt = (await import('bcryptjs')).default;

    const defaultUser = {
        username: 'testuser',
        password: await bcrypt.hash('password123', 10),
        email: 'test@example.com',
        userGroup: 'employee',
        loginStatus: 'inactive',
        ...userData
    };

    const user = new User(defaultUser);
    await user.save();
    return user;
}

// Helper function to create test appointment
export async function createTestAppointment(appointmentData = {}, userId) {
    const Appointment = (await import('../../models/Appointment')).default;

    const defaultAppointment = {
        title: 'Test Appointment',
        date: new Date(),
        time: '10:00',
        description: 'Test description',
        status: 'scheduled',
        userId: userId,
        ...appointmentData
    };

    const appointment = new Appointment(defaultAppointment);
    await appointment.save();
    return appointment;
}

// Helper function to create test attendance
export async function createTestAttendance(attendanceData = {}, userId) {
    const Attendance = (await import('../../models/Attendance')).default;

    const defaultAttendance = {
        userId: userId,
        date: new Date(),
        loginTime: new Date(),
        status: 'present',
        totalHours: 0,
        ...attendanceData
    };

    const attendance = new Attendance(defaultAttendance);
    await attendance.save();
    return attendance;
}

// Helper function to generate JWT token
export async function generateTestToken(userId, userGroup = 'employee') {
    const jwt = (await import('jsonwebtoken')).default;

    return jwt.sign(
        { userId, userGroup },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}
