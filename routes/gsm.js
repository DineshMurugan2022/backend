const { rateLimit } = require('express-rate-limit');
const express = require('express');
const auth = require('../middleware/auth');
const { localGsm } = require('../services/localGsm');
const { issueTicket } = require('../services/desktopGsm');
const { desktopRelay } = require('../services/desktopRelay');
const router = express.Router();
const serviceFor = userId => desktopRelay.host(userId) || !localGsm.available ? desktopRelay : localGsm;
const stateFor = userId => ({ ...serviceFor(userId).state(userId), desktopMode: !localGsm.available || Boolean(desktopRelay.host(userId)) });
router.use(auth);
router.post('/desktop-ticket', (req, res) => {
  try { res.set('Cache-Control', 'no-store').json({ ticket: issueTicket(String(req.user._id), req.headers.origin) }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
router.get('/snapshot', rateLimit({ windowMs: 60000, limit: 90, keyGenerator: req => String(req.user._id) }), (req, res) => res.json({ state: stateFor(String(req.user._id)), devices: serviceFor(String(req.user._id)).devices(String(req.user._id)) }));
router.get('/state', (req, res) => res.json(stateFor(String(req.user._id))));
router.get('/devices', (req, res) => res.json(serviceFor(String(req.user._id)).devices(String(req.user._id))));
router.post('/unpair', async (req, res) => {
  try { desktopRelay.release(String(req.user._id)); await localGsm.release(String(req.user._id)); res.json({ ok: true }); }
  catch (error) { res.status(409).json({ error: error.message }); }
});
router.post('/:action', async (req, res) => {
  try { res.json(await serviceFor(String(req.user._id)).action(String(req.user._id), req.params.action, req.body)); }
  catch (error) { res.status(409).json({ error: error.message }); }
});
module.exports = router;
