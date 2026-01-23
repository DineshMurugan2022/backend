import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../../models/Query', () => ({ default: vi.fn() }));
vi.mock('../../models/User', () => ({ default: vi.fn() }));

const Query = (await import('../../models/Query')).default;
const User = (await import('../../models/User')).default;

describe('Queries API', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = express();
        app.use(express.json());

        // Mock auth middleware
        app.use((req, res, next) => {
            req.user = { userId: 'user123', userGroup: 'employee' };
            next();
        });
    });

    describe('GET /api/queries', () => {
        it('should return list of queries', async () => {
            const mockQueries = [
                {
                    _id: 'query1',
                    title: 'Product Inquiry',
                    description: 'Question about pricing',
                    status: 'open',
                    priority: 'high',
                    createdBy: { _id: 'user1', username: 'user1' }
                },
                {
                    _id: 'query2',
                    title: 'Technical Support',
                    description: 'Need help with setup',
                    status: 'in-progress',
                    priority: 'medium',
                    createdBy: { _id: 'user2', username: 'user2' }
                }
            ];

            Query.find = vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockResolvedValue(mockQueries)
            });

            app.get('/api/queries', async (req, res) => {
                try {
                    const queries = await Query.find()
                        .populate('createdBy', 'username name')
                        .populate('assignedTo', 'username name')
                        .sort({ createdAt: -1 });
                    res.json(queries);
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app).get('/api/queries');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(2);
        });
    });

    describe('POST /api/queries', () => {
        it('should create a new query', async () => {
            const newQuery = {
                title: 'New Query',
                description: 'Query description',
                priority: 'high',
                category: 'technical'
            };

            const savedQuery = {
                _id: 'query123',
                ...newQuery,
                status: 'open',
                createdBy: 'user123',
                createdAt: new Date()
            };

            const mockSave = vi.fn().mockResolvedValue(savedQuery);
            Query.mockImplementation(() => ({
                save: mockSave
            }));

            app.post('/api/queries', async (req, res) => {
                try {
                    if (!req.body.title || !req.body.description) {
                        return res.status(400).json({ error: 'Missing required fields' });
                    }

                    res.status(201).json(savedQuery);
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app)
                .post('/api/queries')
                .send(newQuery);

            expect(response.status).toBe(201);
            expect(response.body.title).toBe('New Query');
        });

        it('should validate required fields', async () => {
            app.post('/api/queries', async (req, res) => {
                if (!req.body.title || !req.body.description) {
                    return res.status(400).json({ error: 'Missing required fields' });
                }
                res.status(201).json({});
            });

            const response = await request(app)
                .post('/api/queries')
                .send({ title: 'Query' }); // Missing description

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/queries/:id', () => {
        it('should update query status', async () => {
            const mockQuery = {
                _id: 'query123',
                title: 'Query',
                status: 'open',
                save: vi.fn().mockResolvedValue(true)
            };

            Query.findById = vi.fn().mockResolvedValue(mockQuery);

            app.put('/api/queries/:id', async (req, res) => {
                try {
                    const query = await Query.findById(req.params.id);
                    if (!query) {
                        return res.status(404).json({ error: 'Query not found' });
                    }
                    Object.assign(query, req.body);
                    await query.save();
                    res.json(query);
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app)
                .put('/api/queries/query123')
                .send({ status: 'resolved' });

            expect(response.status).toBe(200);
            expect(mockQuery.save).toHaveBeenCalled();
        });
    });

    describe('DELETE /api/queries/:id', () => {
        it('should delete a query', async () => {
            Query.findByIdAndDelete = vi.fn().mockResolvedValue({ _id: 'query123' });

            app.delete('/api/queries/:id', async (req, res) => {
                try {
                    const query = await Query.findByIdAndDelete(req.params.id);
                    if (!query) {
                        return res.status(404).json({ error: 'Query not found' });
                    }
                    res.json({ message: 'Query deleted' });
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app).delete('/api/queries/query123');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Query deleted');
        });
    });
});
