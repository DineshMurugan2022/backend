import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import './setup.js';
import { createTestUser, generateTestToken } from './setup.js';

const User = (await import('../../models/User')).default;
const authRouter = (await import('../../login/Auth')).default;

describe('Authentication Integration Tests', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/auth', authRouter);
    });

    describe('POST /api/auth/login', () => {
        it('should login successfully with valid credentials', async () => {
            // Create a test user
            const password = 'password123';
            const hashedPassword = await bcrypt.hash(password, 10);

            await createTestUser({
                username: 'integrationuser',
                password: hashedPassword,
                email: 'integration@test.com'
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'integrationuser',
                    password: password
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body.user).toHaveProperty('username', 'integrationuser');
        });

        it('should reject invalid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'nonexistent',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
        });

        it('should update user login status on successful login', async () => {
            const password = 'password123';
            const hashedPassword = await bcrypt.hash(password, 10);

            const user = await createTestUser({
                username: 'statususer',
                password: hashedPassword,
                loginStatus: 'inactive'
            });

            await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'statususer',
                    password: password
                });

            const updatedUser = await User.findById(user._id);
            expect(updatedUser.loginStatus).toBe('active');
        });
    });

    describe('POST /api/auth/logout', () => {
        it('should logout successfully', async () => {
            const user = await createTestUser({
                username: 'logoutuser',
                loginStatus: 'active'
            });

            const token = await generateTestToken(user._id);

            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);

            const updatedUser = await User.findById(user._id);
            expect(updatedUser.loginStatus).toBe('inactive');
        });
    });

    describe('Token Validation', () => {
        it('should validate correct JWT token', async () => {
            const user = await createTestUser({
                username: 'tokenuser'
            });

            const token = await generateTestToken(user._id);

            expect(token).toBeTruthy();
            expect(typeof token).toBe('string');
        });
    });
});
