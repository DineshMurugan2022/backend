const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const app = express(); app.use(express.json()); app.use('/gsm', require('../routes/gsm'));
test('every modem endpoint rejects unauthenticated requests', async () => {
  for (const path of ['state', 'devices']) assert.equal((await request(app).get(`/gsm/${path}`)).status, 401);
  for (const path of ['pair', 'unpair', 'dial', 'answer', 'hangup', 'connect']) {
    assert.equal((await request(app).post(`/gsm/${path}`).send({ userId: 'victim' })).status, 401);
  }
});
