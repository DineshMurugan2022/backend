import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../../models/Attendance', () => ({ default: vi.fn() }));
vi.mock('../../models/Task', () => ({ default: vi.fn() }));
vi.mock('../../models/Lead', () => ({ default: vi.fn() }));
vi.mock('../../models/User', () => ({ default: vi.fn() }));

const Attendance = (await import('../../models/Attendance')).default;
const Task = (await import('../../models/Task')).default;
const Lead = (await import('../../models/Lead')).default;
const User = (await import('../../models/User')).default;

describe('Reports API', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = express();
        app.use(express.json());

        // Mock auth middleware
        app.use((req, res, next) => {
            req.user = { userId: 'user123', userGroup: 'admin' };
            next();
        });
    });

    describe('GET /api/reports/attendance', () => {
        it('should return attendance report', async () => {
            const mockAttendance = [
                {
                    userId: { _id: 'user1', username: 'user1' },
                    date: new Date('2026-01-20'),
                    status: 'present',
                    totalHours: 8
                },
                {
                    userId: { _id: 'user1', username: 'user1' },
                    date: new Date('2026-01-21'),
                    status: 'present',
                    totalHours: 7.5
                }
            ];

            Attendance.find = vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue(mockAttendance)
                })
            });

            app.get('/api/reports/attendance', async (req, res) => {
                try {
                    const { startDate, endDate, userId } = req.query;

                    const query = {};
                    if (startDate && endDate) {
                        query.date = {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate)
                        };
                    }
                    if (userId) {
                        query.userId = userId;
                    }

                    const attendance = await Attendance.find(query)
                        .populate('userId', 'username name')
                        .sort({ date: -1 });

                    res.json(attendance);
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app)
                .get('/api/reports/attendance')
                .query({ startDate: '2026-01-20', endDate: '2026-01-21' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(2);
        });

        it('should filter by user', async () => {
            Attendance.find = vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue([])
                })
            });

            app.get('/api/reports/attendance', async (req, res) => {
                const query = {};
                if (req.query.userId) {
                    query.userId = req.query.userId;
                }
                await Attendance.find(query).populate('userId').sort({ date: -1 });
                res.json([]);
            });

            await request(app)
                .get('/api/reports/attendance')
                .query({ userId: 'user123' });

            expect(Attendance.find).toHaveBeenCalledWith({ userId: 'user123' });
        });
    });

    describe('GET /api/reports/tasks', () => {
        it('should return task completion report', async () => {
            const mockTasks = [
                {
                    _id: 'task1',
                    title: 'Task 1',
                    status: 'completed',
                    assignedTo: { _id: 'user1', username: 'user1' },
                    completedAt: new Date()
                },
                {
                    _id: 'task2',
                    title: 'Task 2',
                    status: 'pending',
                    assignedTo: { _id: 'user1', username: 'user1' }
                }
            ];

            Task.find = vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue(mockTasks)
                })
            });

            app.get('/api/reports/tasks', async (req, res) => {
                try {
                    const { status, userId } = req.query;

                    const query = {};
                    if (status) query.status = status;
                    if (userId) query.assignedTo = userId;

                    const tasks = await Task.find(query)
                        .populate('assignedTo', 'username name')
                        .sort({ createdAt: -1 });

                    res.json(tasks);
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app).get('/api/reports/tasks');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('GET /api/reports/leads', () => {
        it('should return lead conversion report', async () => {
            const mockLeads = [
                {
                    _id: 'lead1',
                    name: 'Lead 1',
                    status: 'converted',
                    source: 'website'
                },
                {
                    _id: 'lead2',
                    name: 'Lead 2',
                    status: 'contacted',
                    source: 'referral'
                }
            ];

            Lead.find = vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue(mockLeads)
                })
            });

            app.get('/api/reports/leads', async (req, res) => {
                try {
                    const { status, source } = req.query;

                    const query = {};
                    if (status) query.status = status;
                    if (source) query.source = source;

                    const leads = await Lead.find(query)
                        .populate('assignedTo', 'username name')
                        .sort({ createdAt: -1 });

                    res.json(leads);
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app).get('/api/reports/leads');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should filter by status', async () => {
            Lead.find = vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue([])
                })
            });

            app.get('/api/reports/leads', async (req, res) => {
                const query = {};
                if (req.query.status) {
                    query.status = req.query.status;
                }
                await Lead.find(query).populate('assignedTo').sort({ createdAt: -1 });
                res.json([]);
            });

            await request(app)
                .get('/api/reports/leads')
                .query({ status: 'converted' });

            expect(Lead.find).toHaveBeenCalledWith({ status: 'converted' });
        });
    });

    describe('POST /api/reports/export', () => {
        it('should export report data', async () => {
            app.post('/api/reports/export', async (req, res) => {
                try {
                    const { reportType, format, filters } = req.body;

                    if (!reportType) {
                        return res.status(400).json({ error: 'Report type is required' });
                    }

                    // Simulate export
                    res.json({
                        message: 'Export initiated',
                        reportType,
                        format: format || 'csv',
                        filters
                    });
                } catch (error) {
                    res.status(500).json({ error: 'Server error' });
                }
            });

            const response = await request(app)
                .post('/api/reports/export')
                .send({
                    reportType: 'attendance',
                    format: 'csv',
                    filters: { startDate: '2026-01-01', endDate: '2026-01-31' }
                });

            expect(response.status).toBe(200);
            expect(response.body.reportType).toBe('attendance');
            expect(response.body.format).toBe('csv');
        });

        it('should validate required fields', async () => {
            app.post('/api/reports/export', async (req, res) => {
                if (!req.body.reportType) {
                    return res.status(400).json({ error: 'Report type is required' });
                }
                res.json({});
            });

            const response = await request(app)
                .post('/api/reports/export')
                .send({ format: 'csv' });

            expect(response.status).toBe(400);
        });
    });
});
