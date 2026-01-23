import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import './setup.js';
import { createTestUser, createTestAppointment, generateTestToken } from './setup.js';

const Appointment = (await import('../../models/Appointment')).default;
const appointmentsRouter = (await import('../../routes/appointments')).default;
const auth = (await import('../../middleware/auth')).default;

describe('Appointments Integration Tests', () => {
    let app;
    let testUser;
    let authToken;

    beforeAll(async () => {
        app = express();
        app.use(express.json());
        app.use('/api/appointments', auth, appointmentsRouter);

        // Create test user and token
        testUser = await createTestUser({
            username: 'appointmentuser',
            userGroup: 'employee'
        });
        authToken = await generateTestToken(testUser._id, testUser.userGroup);
    });

    describe('GET /api/appointments', () => {
        it('should return list of appointments', async () => {
            // Create test appointments
            await createTestAppointment({
                title: 'Meeting 1',
                date: new Date('2026-01-25')
            }, testUser._id);

            await createTestAppointment({
                title: 'Meeting 2',
                date: new Date('2026-01-26')
            }, testUser._id);

            const response = await request(app)
                .get('/api/appointments')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(2);
        });

        it('should filter appointments by date range', async () => {
            const startDate = '2026-01-25';
            const endDate = '2026-01-26';

            const response = await request(app)
                .get('/api/appointments')
                .query({ startDate, endDate })
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('POST /api/appointments', () => {
        it('should create a new appointment', async () => {
            const newAppointment = {
                title: 'New Integration Test Meeting',
                date: '2026-01-30',
                time: '14:00',
                description: 'Integration test appointment'
            };

            const response = await request(app)
                .post('/api/appointments')
                .set('Authorization', `Bearer ${authToken}`)
                .send(newAppointment);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('title', newAppointment.title);
            expect(response.body).toHaveProperty('_id');

            // Verify in database
            const savedAppointment = await Appointment.findById(response.body._id);
            expect(savedAppointment).toBeTruthy();
            expect(savedAppointment.title).toBe(newAppointment.title);
        });

        it('should reject appointment without required fields', async () => {
            const response = await request(app)
                .post('/api/appointments')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ title: 'Incomplete' });

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/appointments/:id', () => {
        it('should update appointment status', async () => {
            const appointment = await createTestAppointment({
                title: 'Update Test',
                status: 'scheduled'
            }, testUser._id);

            const response = await request(app)
                .put(`/api/appointments/${appointment._id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ status: 'completed' });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('completed');

            // Verify in database
            const updatedAppointment = await Appointment.findById(appointment._id);
            expect(updatedAppointment.status).toBe('completed');
        });
    });

    describe('DELETE /api/appointments/:id', () => {
        it('should delete an appointment', async () => {
            const appointment = await createTestAppointment({
                title: 'Delete Test'
            }, testUser._id);

            const response = await request(app)
                .delete(`/api/appointments/${appointment._id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);

            // Verify deletion in database
            const deletedAppointment = await Appointment.findById(appointment._id);
            expect(deletedAppointment).toBeNull();
        });
    });
});
