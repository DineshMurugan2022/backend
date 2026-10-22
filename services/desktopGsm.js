const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const ISSUER = 'crm-gsm-desktop';
const AUDIENCE = 'gsm-desktop-ticket';
const consumed = new Map();
function issueTicket(userId, origin) {
  if (!origin || !/^https?:\/\//.test(origin)) throw new Error('A website origin is required.');
  return jwt.sign({ sub: userId, origin, jti: crypto.randomUUID() }, process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE, expiresIn: 60 });
}
function exchangeTicket(ticket) {
  const claims = jwt.verify(ticket, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  if (!claims.sub || !claims.jti || !claims.origin) throw new Error('Invalid modem ticket.');
  for (const [key, expires] of consumed) if (expires < Date.now()) consumed.delete(key);
  if (consumed.has(claims.jti)) throw new Error('Connection ticket has already been used.');
  consumed.set(claims.jti, claims.exp * 1000);
  return { userId: claims.sub, origin: claims.origin };
}
module.exports = { issueTicket, exchangeTicket };
