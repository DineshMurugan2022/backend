const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const Module = require('module');
let updates = [], deletes = [], user;
const model = {findOneAndUpdate: async (...args) => {updates.push(args); return null;}, findOneAndDelete: async (...args) => {deletes.push(args); return null;}};
const inject = (name, value) => { const id = require.resolve(name); const entry = new Module(id); entry.exports = value; require.cache[id] = entry; };
inject('../models/CallLog', model);
inject('../middleware/auth', (req,res,next) => {req.user = user; next();});
inject('../services/cloudConnect', {});
inject('../sockets/io', {getIOInstance: () => null});
inject('../models/User', {});
const router = require('../routes/calls');
const app = express(); app.use(express.json()); app.use('/calls', router);
beforeEach(() => {updates = []; deletes = []; user = {_id: 'owner-id'};});
test('updates are constrained to the authenticated owner', async () => {
 const response = await request(app).patch('/calls/other-record').send({status:'completed'});
 assert.equal(response.status,404);
 assert.deepEqual(updates[0][0],{_id:'other-record',userId:'owner-id'});
});
test('deletes are constrained to the authenticated owner', async () => {
 const response = await request(app).delete('/calls/other-record');
 assert.equal(response.status,404);
 assert.deepEqual(deletes[0][0],{_id:'other-record',userId:'owner-id'});
});
test('missing SIP credentials never fall back to a shared account', async () => {
 const response = await request(app).get('/calls/sip-config');
 assert.equal(response.status,409); assert.equal(response.body.password,undefined);
});
test('returns only the configured user identity', async () => {
 user = {_id:'owner-id',sipUsername:'account@example.test',sipExtension:'702',sipPassword:'test-only-password',sipDomain:'example.test'};
 const response=await request(app).get('/calls/sip-config');
 assert.equal(response.status,200); assert.equal(response.body.username,'account'); assert.equal(response.body.extension,'702');
});
test('rejects backwards timestamps before database mutation', async () => {
 const response=await request(app).patch('/calls/log').send({callStart:'2026-09-17T12:00:00Z',callEnd:'2026-09-17T11:00:00Z'});
 assert.equal(response.status,400); assert.equal(updates.length,0);
});
