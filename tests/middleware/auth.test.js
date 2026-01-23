import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock User model
vi.mock('../../models/User');

const User = (await import('../../models/User')).default;

describe('Auth Middleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;
    let authMiddleware;

    beforeEach(async () => {
        vi.clearAllMocks();

        mockReq = {
            header: vi.fn(),
            headers: {}
        };

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        mockNext = vi.fn();

        // Simple auth middleware implementation for testing
        authMiddleware = async (req, res, next) => {
            try {
                const token = req.header('Authorization')?.replace('Bearer ', '');

                if (!token) {
                    return res.status(401).json({ message: 'No token, authorization denied' });
                }

                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.userId).select('-password');

                if (!user) {
                    return res.status(401).json({ message: 'User not found' });
                }

                req.user = user;
                next();
            } catch (error) {
                res.status(401).json({ message: 'Token is not valid' });
            }
        };
    });

    describe('Token Validation', () => {
        it('should authenticate with valid token', async () => {
            const mockUser = {
                _id: 'user123',
                username: 'testuser',
                userGroup: 'employee'
            };

            const token = jwt.sign(
                { userId: mockUser._id },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            mockReq.header = vi.fn().mockReturnValue(`Bearer ${token}`);
            User.findById = vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue(mockUser)
            });

            await authMiddleware(mockReq, mockRes, mockNext);

            expect(mockReq.user).toEqual(mockUser);
            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should reject request without token', async () => {
            mockReq.header = vi.fn().mockReturnValue(undefined);

            await authMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'No token, authorization denied'
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject invalid token', async () => {
            mockReq.header = vi.fn().mockReturnValue('Bearer invalid.token.here');

            await authMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'Token is not valid'
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject expired token', async () => {
            const expiredToken = jwt.sign(
                { userId: 'user123' },
                process.env.JWT_SECRET,
                { expiresIn: '-1h' } // Already expired
            );

            mockReq.header = vi.fn().mockReturnValue(`Bearer ${expiredToken}`);

            await authMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject token for non-existent user', async () => {
            const token = jwt.sign(
                { userId: 'nonexistent' },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            mockReq.header = vi.fn().mockReturnValue(`Bearer ${token}`);
            User.findById = vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue(null)
            });

            await authMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'User not found'
            });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('Authorization Levels', () => {
        it('should allow admin access', async () => {
            const adminUser = {
                _id: 'admin123',
                username: 'admin',
                userGroup: 'admin'
            };

            const token = jwt.sign(
                { userId: adminUser._id, userGroup: 'admin' },
                process.env.JWT_SECRET
            );

            mockReq.header = vi.fn().mockReturnValue(`Bearer ${token}`);
            User.findById = vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue(adminUser)
            });

            await authMiddleware(mockReq, mockRes, mockNext);

            expect(mockReq.user.userGroup).toBe('admin');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should allow team leader access', async () => {
            const teamLeader = {
                _id: 'tl123',
                username: 'teamlead',
                userGroup: 'team leader'
            };

            const token = jwt.sign(
                { userId: teamLeader._id, userGroup: 'team leader' },
                process.env.JWT_SECRET
            );

            mockReq.header = vi.fn().mockReturnValue(`Bearer ${token}`);
            User.findById = vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue(teamLeader)
            });

            await authMiddleware(mockReq, mockRes, mockNext);

            expect(mockReq.user.userGroup).toBe('team leader');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should allow employee access', async () => {
            const employee = {
                _id: 'emp123',
                username: 'employee',
                userGroup: 'employee'
            };

            const token = jwt.sign(
                { userId: employee._id, userGroup: 'employee' },
                process.env.JWT_SECRET
            );

            mockReq.header = vi.fn().mockReturnValue(`Bearer ${token}`);
            User.findById = vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue(employee)
            });

            await authMiddleware(mockReq, mockRes, mockNext);

            expect(mockReq.user.userGroup).toBe('employee');
            expect(mockNext).toHaveBeenCalled();
        });
    });
});
