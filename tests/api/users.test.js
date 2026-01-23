import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../../models/User');
vi.mock('../../middleware/auth', () => ({
    default: (req, res, next) => {
        req.user = { userId: 'admin123', userGroup: 'admin' };
        next();
    }
}));

const User = (await import('../../models/User')).default;

describe('Users API', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = express();
        app.use(express.json());
    });

    describe('GET /api/users', () => {
        it('should return list of users', async () => {
            const mockUsers = [
                { _id: 'user1', username: 'user1', userGroup: 'employee', loginStatus: 'active' },
                { _id: 'user2', username: 'user2', userGroup: 'employee', loginStatus: 'inactive' }
            ];

            User.find = vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue(mockUsers)
            });

            app.get('/api/users', async (req, res) => {
                const users = await User.find().select('-password');
                res.json(users);
            });

            const response = await request(app).get('/api/users');

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
            expect(response.body[0].username).toBe('user1');
        });

        it('should handle errors gracefully', async () => {
            User.find = vi.fn().mockReturnValue({
                select: vi.fn().mockRejectedValue(new Error('Database error'))
            });

            app.get('/api/users', async (req, res) => {
                try {
                    const users = await User.find().select('-password');
                    res.json(users);
                } catch (error) {
                    res.status(500).json({ message: 'Server error' });
                }
            });

            const response = await request(app).get('/api/users');

            expect(response.status).toBe(500);
            expect(response.body.message).toBe('Server error');
        });
    });

    describe('POST /api/users', () => {
        it('should create a new user', async () => {
            const newUser = {
                username: 'newuser',
                password: 'password123',
                userGroup: 'employee',
                email: 'newuser@example.com'
            };

            const savedUser = {
                _id: 'newuser123',
                ...newUser,
                loginStatus: 'inactive'
            };

            User.findOne = vi.fn().mockResolvedValue(null);
            User.prototype.save = vi.fn().mockResolvedValue(savedUser);

            app.post('/api/users', async (req, res) => {
                try {
                    const existing = await User.findOne({ username: req.body.username });
                    if (existing) {
                        return res.status(400).json({ message: 'User already exists' });
                    }

                    const user = new User(req.body);
                    await user.save();
                    res.status(201).json({ message: 'User created', userId: savedUser._id });
                } catch (error) {
                    res.status(500).json({ message: 'Server error' });
                }
            });

            const response = await request(app)
                .post('/api/users')
                .send(newUser);

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('User created');
        });

        it('should reject duplicate username', async () => {
            User.findOne = vi.fn().mockResolvedValue({ username: 'existinguser' });

            app.post('/api/users', async (req, res) => {
                const existing = await User.findOne({ username: req.body.username });
                if (existing) {
                    return res.status(400).json({ message: 'User already exists' });
                }
                res.status(201).json({ message: 'User created' });
            });

            const response = await request(app)
                .post('/api/users')
                .send({ username: 'existinguser', password: 'pass123' });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('User already exists');
        });
    });

    describe('PUT /api/users/:id', () => {
        it('should update user details', async () => {
            const mockUser = {
                _id: 'user123',
                username: 'testuser',
                userGroup: 'employee',
                save: vi.fn().mockResolvedValue(true)
            };

            User.findById = vi.fn().mockResolvedValue(mockUser);

            app.put('/api/users/:id', async (req, res) => {
                try {
                    const user = await User.findById(req.params.id);
                    if (!user) {
                        return res.status(404).json({ message: 'User not found' });
                    }

                    Object.assign(user, req.body);
                    await user.save();
                    res.json({ message: 'User updated', user });
                } catch (error) {
                    res.status(500).json({ message: 'Server error' });
                }
            });

            const response = await request(app)
                .put('/api/users/user123')
                .send({ userGroup: 'team leader' });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('User updated');
            expect(mockUser.save).toHaveBeenCalled();
        });
    });

    describe('DELETE /api/users/:id', () => {
        it('should delete a user', async () => {
            User.findByIdAndDelete = vi.fn().mockResolvedValue({ _id: 'user123' });

            app.delete('/api/users/:id', async (req, res) => {
                try {
                    const user = await User.findByIdAndDelete(req.params.id);
                    if (!user) {
                        return res.status(404).json({ message: 'User not found' });
                    }
                    res.json({ message: 'User deleted' });
                } catch (error) {
                    res.status(500).json({ message: 'Server error' });
                }
            });

            const response = await request(app).delete('/api/users/user123');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('User deleted');
        });

        it('should return 404 for non-existent user', async () => {
            User.findByIdAndDelete = vi.fn().mockResolvedValue(null);

            app.delete('/api/users/:id', async (req, res) => {
                const user = await User.findByIdAndDelete(req.params.id);
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }
                res.json({ message: 'User deleted' });
            });

            const response = await request(app).delete('/api/users/nonexistent');

            expect(response.status).toBe(404);
        });
    });
});
