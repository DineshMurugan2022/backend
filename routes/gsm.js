const express = require('express');
const auth = require('../middleware/auth');
const { localGsm } = require('../services/localGsm');
const router = express.Router();
router.use(auth);
router.get('/state', (req, res) => res.json(localGsm.state(String(req.user._id))));
router.get('/devices', (req, res) => res.json(localGsm.devices(String(req.user._id))));
// Kept for logout cleanup; the UI does not need pairing codes.
router.post('/unpair', async (req, res) => {
  try { await localGsm.release(String(req.user._id)); res.json({ ok: true }); }
  catch (error) { res.status(409).json({ error: error.message }); }
});
router.post('/:action', async (req, res) => {
  try { res.json(await localGsm.action(String(req.user._id), req.params.action, req.body)); }
  catch (error) { res.status(409).json({ error: error.message }); }
});
module.exports = router;
