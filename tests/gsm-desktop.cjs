const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { issueTicket, exchangeTicket } = require('../services/desktopGsm');
process.env.JWT_SECRET = 'test-only-modem-ticket-key-that-is-not-a-production-secret';
const origin = 'https://bnycrm1.vercel.app';
test('modem tickets identify the authenticated account and can only be exchanged once', () => {
  const ticket = issueTicket('alice', origin);
  assert.deepEqual(exchangeTicket(ticket), { userId: 'alice', origin });
  assert.throws(() => exchangeTicket(ticket), /already/);
});
test('ordinary login tokens, expired tokens, and forged tickets cannot register a modem', () => {
  const wrong = jwt.sign({ sub: 'alice' }, process.env.JWT_SECRET);
  const expired = jwt.sign({ sub: 'alice', jti: 'expired', origin }, process.env.JWT_SECRET,
    { issuer: 'crm-gsm-desktop', audience: 'gsm-desktop-ticket', expiresIn: -1 });
  assert.throws(() => exchangeTicket(wrong)); assert.throws(() => exchangeTicket(expired)); assert.throws(() => exchangeTicket('forged'));
});
