import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../../models/Message', () => {
    return {
        default: vi.fn()
    };
});

vi.mock('../../models/User', () => {
    return {
        default: vi.fn()
    };
});

vi.mock('../../sockets/io', () => ({
    getIOInstance: vi.fn(() => ({
        to: vi.fn().mockReturnThis(),
        emit: vi.fn()
    }))
}));

vi.mock('../../middleware/auth', () => ({
    default: (req, res, next) => {
        req.user = { id: 'user123', _id: 'user123', userGroup: 'employee' };
        next();
    }
}));

const Message = (await import('../../models/Message')).default;
const User = (await import('../../models/User')).default;

describe('Messages API', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = express();
        app.use(express.json());
    });

    describe('GET /api/messages/:userId', () => {
        it('should return conversation between two users', async () => {
            const mockMessages = [
                {
                    _id: 'msg1',
                    sender: { _id: 'user123', username: 'user1' },
                    recipient: { _id: 'user456', username: 'user2' },
                    content: 'Hello',
                    timestamp: new Date()
                },
                {
                    _id: 'msg2',
                    sender: { _id: 'user456', username: 'user2' },
                    recipient: { _id: 'user123', username: 'user1' },
                    content: 'Hi there',
                    timestamp: new Date()
                }
            ];

            User.findById = vi.fn().mockResolvedValue({ _id: 'user456', username: 'user2' });
            Message.find = vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue(mockMessages)
            });

            app.use((req, res, next) => {
                req.user = { id: 'user123', _id: 'user123' };
                next();
            });

            app.get('/api/messages/:userId', async (req, res) => {
                try {
                    const { userId } = req.params;
                    const currentUserId = req.user.id || req.user._id;

                    const userExists = await User.findById(userId);
                    if (!userExists) {
                        return res.status(404).json({ error: 'User not found' });
                    }

                    const messages = await Message.find({
                        $or: [
                            { sender: currentUserId, recipient: userId },
                            { sender: userId, recipient: currentUserId }
                        ]
                    })
                        .populate('sender', 'username name')
                        .populate('recipient', 'username name')
                        .sort({ timestamp: 1 })
                        .limit(100);

                    res.json(messages);
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app).get('/api/messages/user456');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(2);
        });

        it('should return 404 if user not found', async () => {
            User.findById = vi.fn().mockResolvedValue(null);

            app.use((req, res, next) => {
                req.user = { id: 'user123' };
                next();
            });

            app.get('/api/messages/:userId', async (req, res) => {
                const userExists = await User.findById(req.params.userId);
                if (!userExists) {
                    return res.status(404).json({ error: 'User not found' });
                }
                res.json([]);
            });

            const response = await request(app).get('/api/messages/nonexistent');

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/messages', () => {
        it('should send a new message', async () => {
            const newMessage = {
                to: 'user456',
                message: 'Test message'
            };

            const savedMessage = {
                _id: 'msg123',
                sender: 'user123',
                recipient: 'user456',
                content: 'Test message',
                timestamp: new Date()
            };

            User.findById = vi.fn().mockResolvedValue({ _id: 'user456', username: 'user2' });

            const mockSave = vi.fn().mockResolvedValue(savedMessage);
            const mockPopulate = vi.fn().mockResolvedValue(savedMessage);

            Message.mockImplementation(() => ({
                save: mockSave,
                populate: mockPopulate
            }));

            app.use((req, res, next) => {
                req.user = { id: 'user123' };
                next();
            });

            app.post('/api/messages', async (req, res) => {
                try {
                    const { to, message } = req.body;
                    const from = req.user.id;

                    const recipient = await User.findById(to);
                    if (!recipient) {
                        return res.status(404).json({ error: 'Recipient not found' });
                    }

                    if (!message || message.trim() === '') {
                        return res.status(400).json({ error: 'Message content is required' });
                    }

                    res.status(201).json(savedMessage);
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app)
                .post('/api/messages')
                .send(newMessage);

            expect(response.status).toBe(201);
            expect(response.body.content).toBe('Test message');
        });

        it('should reject empty message', async () => {
            User.findById = vi.fn().mockResolvedValue({ _id: 'user456' });

            app.use((req, res, next) => {
                req.user = { id: 'user123' };
                next();
            });

            app.post('/api/messages', async (req, res) => {
                const { message } = req.body;
                if (!message || message.trim() === '') {
                    return res.status(400).json({ error: 'Message content is required' });
                }
                res.status(201).json({});
            });

            const response = await request(app)
                .post('/api/messages')
                .send({ to: 'user456', message: '' });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/messages/unread-count', () => {
        it('should return unread message count', async () => {
            Message.countDocuments = vi.fn().mockResolvedValue(5);

            app.use((req, res, next) => {
                req.user = { id: 'user123', _id: 'user123' };
                next();
            });

            app.get('/api/messages/unread-count', async (req, res) => {
                try {
                    const currentUserId = req.user.id || req.user._id;
                    const unreadCount = await Message.countDocuments({
                        recipient: currentUserId,
                        read: false
                    });
                    res.json({ unreadCount });
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app).get('/api/messages/unread-count');

            expect(response.status).toBe(200);
            expect(response.body.unreadCount).toBe(5);
        });
    });

    describe('PUT /api/messages/read/:userId', () => {
        it('should mark messages as read', async () => {
            Message.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 3 });

            app.use((req, res, next) => {
                req.user = { id: 'user123', _id: 'user123' };
                next();
            });

            app.put('/api/messages/read/:userId', async (req, res) => {
                try {
                    const { userId } = req.params;
                    const currentUserId = req.user.id || req.user._id;

                    await Message.updateMany(
                        { sender: userId, recipient: currentUserId, read: false },
                        { read: true }
                    );

                    res.json({ message: 'Messages marked as read' });
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app).put('/api/messages/read/user456');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Messages marked as read');
            expect(Message.updateMany).toHaveBeenCalled();
        });
    });
});
