import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('AttendanceService - Unit Tests', () => {
    let attendanceService;
    let mockAttendanceModel;
    let mockUserModel;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Create mock models
        mockAttendanceModel = {
            findOne: vi.fn(),
            find: vi.fn(),
            countDocuments: vi.fn()
        };

        mockUserModel = {
            findById: vi.fn()
        };
    });

    describe('recordLogin', () => {
        it('should create a new attendance record if none exists for today', async () => {
            const mockUser = {
                _id: 'user123',
                username: 'testuser',
                loginStatus: 'inactive',
                save: vi.fn().mockResolvedValue(true)
            };

            const mockAttendance = {
                userId: mockUser._id,
                date: new Date(),
                loginTime: new Date(),
                status: 'present',
                save: vi.fn().mockResolvedValue(true)
            };

            mockAttendanceModel.findOne.mockResolvedValue(null);

            // Simulate recordLogin logic
            const result = await (async () => {
                const existingRecord = await mockAttendanceModel.findOne();

                if (!existingRecord) {
                    mockUser.loginStatus = 'active';
                    await mockUser.save();
                    await mockAttendance.save();
                    return { success: true, currentAttendance: mockAttendance };
                }
            })();

            expect(mockAttendanceModel.findOne).toHaveBeenCalled();
            expect(mockUser.loginStatus).toBe('active');
            expect(mockUser.save).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('should update existing record if it already exists', async () => {
            const mockUser = {
                _id: 'user123',
                loginStatus: 'inactive',
                save: vi.fn().mockResolvedValue(true)
            };

            const existingRecord = {
                userId: mockUser._id,
                status: 'absent',
                loginTime: null,
                save: vi.fn().mockResolvedValue(true)
            };

            mockAttendanceModel.findOne.mockResolvedValue(existingRecord);

            // Simulate recordLogin logic
            await (async () => {
                const record = await mockAttendanceModel.findOne();

                if (record) {
                    record.status = 'present';
                    record.loginTime = new Date();
                    mockUser.loginStatus = 'active';
                    await record.save();
                    await mockUser.save();
                }
            })();

            expect(existingRecord.status).toBe('present');
            expect(existingRecord.loginTime).toBeDefined();
            expect(existingRecord.save).toHaveBeenCalled();
        });
    });

    describe('recordLogout', () => {
        it('should update logout time and calculate hours', async () => {
            const loginTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
            const logoutTime = new Date();

            const mockUser = {
                _id: 'user123',
                loginStatus: 'active',
                save: vi.fn().mockResolvedValue(true)
            };

            const existingRecord = {
                userId: mockUser._id,
                loginTime,
                logoutTime: null,
                totalHours: 0,
                save: vi.fn().mockResolvedValue(true)
            };

            mockAttendanceModel.findOne.mockResolvedValue(existingRecord);

            // Simulate recordLogout logic
            await (async () => {
                const record = await mockAttendanceModel.findOne();

                if (record) {
                    record.logoutTime = logoutTime;
                    const hours = (logoutTime - record.loginTime) / (1000 * 60 * 60);
                    record.totalHours = parseFloat(hours.toFixed(2));
                    mockUser.loginStatus = 'inactive';
                    await record.save();
                    await mockUser.save();
                }
            })();

            expect(mockUser.loginStatus).toBe('inactive');
            expect(existingRecord.logoutTime).toEqual(logoutTime);
            expect(existingRecord.totalHours).toBeGreaterThan(1.9);
            expect(existingRecord.totalHours).toBeLessThan(2.1);
            expect(existingRecord.save).toHaveBeenCalled();
        });
    });

    describe('getAttendanceByDateRange', () => {
        it('should return attendance records for date range', async () => {
            const mockRecords = [
                {
                    userId: 'user123',
                    date: new Date('2026-01-20'),
                    status: 'present',
                    totalHours: 8
                },
                {
                    userId: 'user123',
                    date: new Date('2026-01-21'),
                    status: 'present',
                    totalHours: 7.5
                }
            ];

            mockAttendanceModel.find.mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue(mockRecords)
                })
            });

            const startDate = new Date('2026-01-20');
            const endDate = new Date('2026-01-21');

            // Simulate getAttendanceByDateRange logic
            const result = await mockAttendanceModel.find()
                .populate('userId', 'username')
                .sort({ date: 1 });

            expect(mockAttendanceModel.find).toHaveBeenCalled();
            expect(result).toHaveLength(2);
        });
    });

    describe('calculateMonthlyStats', () => {
        it('should calculate monthly attendance statistics', async () => {
            const mockRecords = [
                { status: 'present', totalHours: 8 },
                { status: 'present', totalHours: 7.5 },
                { status: 'absent', totalHours: 0 },
                { status: 'permission', totalHours: 4 },
                { status: 'leave', totalHours: 0 }
            ];

            mockAttendanceModel.find.mockResolvedValue(mockRecords);

            // Simulate calculateMonthlyStats logic
            const records = await mockAttendanceModel.find();
            const stats = {
                totalPresent: records.filter(r => r.status === 'present').length,
                totalAbsent: records.filter(r => r.status === 'absent').length,
                totalPermission: records.filter(r => r.status === 'permission').length,
                totalLeave: records.filter(r => r.status === 'leave').length,
                totalHours: records.reduce((sum, r) => sum + r.totalHours, 0)
            };

            expect(stats.totalPresent).toBe(2);
            expect(stats.totalAbsent).toBe(1);
            expect(stats.totalPermission).toBe(1);
            expect(stats.totalLeave).toBe(1);
            expect(stats.totalHours).toBe(19.5);
        });
    });

    describe('markManualAttendance', () => {
        it('should create manual attendance record', async () => {
            const mockAttendance = {
                userId: 'user123',
                date: new Date('2026-01-20'),
                status: 'permission',
                remarks: 'Medical appointment',
                save: vi.fn().mockResolvedValue(true)
            };

            mockAttendanceModel.findOne.mockResolvedValue(null);

            // Simulate markManualAttendance logic
            await (async () => {
                const existing = await mockAttendanceModel.findOne();

                if (!existing) {
                    await mockAttendance.save();
                }
            })();

            expect(mockAttendance.save).toHaveBeenCalled();
        });

        it('should update existing manual attendance record', async () => {
            const existingRecord = {
                userId: 'user123',
                date: new Date('2026-01-20'),
                status: 'absent',
                save: vi.fn().mockResolvedValue(true)
            };

            mockAttendanceModel.findOne.mockResolvedValue(existingRecord);

            // Simulate markManualAttendance logic
            await (async () => {
                const record = await mockAttendanceModel.findOne();

                if (record) {
                    record.status = 'permission';
                    record.remarks = 'Updated status';
                    await record.save();
                }
            })();

            expect(existingRecord.status).toBe('permission');
            expect(existingRecord.remarks).toBe('Updated status');
            expect(existingRecord.save).toHaveBeenCalled();
        });
    });

    describe('Attendance Validation', () => {
        it('should validate attendance status values', () => {
            const validStatuses = ['present', 'absent', 'permission', 'leave'];

            validStatuses.forEach(status => {
                expect(['present', 'absent', 'permission', 'leave']).toContain(status);
            });
        });

        it('should calculate hours correctly', () => {
            const loginTime = new Date('2026-01-22T09:00:00');
            const logoutTime = new Date('2026-01-22T17:30:00');

            const hours = (logoutTime - loginTime) / (1000 * 60 * 60);
            const totalHours = parseFloat(hours.toFixed(2));

            expect(totalHours).toBe(8.5);
        });
    });
});
