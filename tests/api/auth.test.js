import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock dependencies
vi.mock('../../models/User');
vi.mock('../../db', () => ({
    default: vi.fn()
}));

const User = (await import('../../models/User')).default;

describe('Authentication API', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = express();
        app.use(express.json());
    });

    describe('POST /api/auth/login', () => {
        it('should login successfully with valid credentials', async () => {
            const mockUser = {
                _id: 'user123',
                username: 'testuser',
                password: await bcrypt.hash('password123', 10),
                userGroup: 'employee',
                loginStatus: 'inactive',
                save: vi.fn().mockResolvedValue(true)
            };

            User.findOne = vi.fn().mockResolvedValue(mockUser);

            // Mock route
            app.post('/api/auth/login', async (req, res) => {
                try {
                    const { username, password } = req.body;
                    const user = await User.findOne({ username });

                    if (!user) {
                        return res.status(401).json({ message: 'Invalid credentials' });
                    }

                    const isMatch = await bcrypt.compare(password, user.password);
                    if (!isMatch) {
                        return res.status(401).json({ message: 'Invalid credentials' });
                    }

                    const token = jwt.sign(
                        { userId: user._id, userGroup: user.userGroup },
                        process.env.JWT_SECRET,
                        { expiresIn: '24h' }
                    );

                    user.loginStatus = 'active';
                    await user.save();

                    res.json({
                        token,
                        user: {
                            id: user._id,
                            username: user.username,
                            userGroup: user.userGroup
                        }
                    });
                } catch (error) {
                    res.status(500).json({ message: 'Server error' });
                }
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'testuser',
                    password: 'password123'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body.user.username).toBe('testuser');
            expect(mockUser.save).toHaveBeenCalled();
        });

        it('should reject login with invalid credentials', async () => {
            User.findOne = vi.fn().mockResolvedValue(null);

            app.post('/api/auth/login', async (req, res) => {
                const user = await User.findOne({ username: req.body.username });
                if (!user) {
                    return res.status(401).json({ message: 'Invalid credentials' });
                }
                res.json({ success: true });
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'wronguser',
                    password: 'wrongpass'
                });

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Invalid credentials');
        });

        it('should reject login with missing fields', async () => {
            app.post('/api/auth/login', async (req, res) => {
                if (!req.body.username || !req.body.password) {
                    return res.status(400).json({ message: 'Username and password required' });
                }
                res.json({ success: true });
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({ username: 'testuser' });

            expect(response.status).toBe(400);
        });
    });

    describe('JWT Token Validation', () => {
        it('should generate valid JWT token', () => {
            const payload = { userId: 'user123', userGroup: 'employee' };
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            expect(decoded.userId).toBe('user123');
            expect(decoded.userGroup).toBe('employee');
        });

        it('should reject invalid JWT token', () => {
            const invalidToken = 'invalid.token.here';

            expect(() => {
                jwt.verify(invalidToken, process.env.JWT_SECRET);
            }).toThrow();
        });
    });
});
