// driver-download.js
// Serves the Huawei Mobile Partner driver installer as a downloadable ZIP file.
const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

function getDriverFilePath() {
  const candidates = [
    path.join(__dirname, '../uploads/drivers/Huawei-Mobile-Partner-Driver.zip'),
    path.join(process.cwd(), 'uploads/drivers/Huawei-Mobile-Partner-Driver.zip'),
    path.join(process.cwd(), 'backend/uploads/drivers/Huawei-Mobile-Partner-Driver.zip'),
    path.join(__dirname, '../../Huawei_Mobile_Partner_with_Voice_USSD(1)/latest Huawei Mobile Partner 23.009.09.01.983 with voice and ussd option/Setup.exe')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// GET /api/drivers/huawei-modem
// Returns the Huawei Mobile Partner driver installer as a file download
router.get('/huawei-modem', (req, res) => {
  const filePath = getDriverFilePath();
  if (!filePath) {
    return res.status(404).json({ error: 'Driver file not found on server.' });
  }

  const isZip = filePath.endsWith('.zip');
  const filename = isZip ? 'Huawei-Mobile-Partner-v23-Driver-Setup.zip' : 'Huawei-Mobile-Partner-Setup.exe';
  const contentType = isZip ? 'application/zip' : 'application/octet-stream';

  const absPath = path.resolve(filePath);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', fs.statSync(absPath).size);
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 1 day
  res.sendFile(absPath);
});

// GET /api/drivers/info
// Returns metadata about available drivers
router.get('/info', (req, res) => {
  const filePath = getDriverFilePath();
  const exists = !!filePath;
  let size = 0;
  let filename = 'Huawei-Mobile-Partner-v23-Driver-Setup.zip';

  if (exists) {
    const stat = fs.statSync(filePath);
    size = stat.size;
    if (filePath.endsWith('.exe')) {
      filename = 'Huawei-Mobile-Partner-Setup.exe';
    }
  }

  res.json({
    available: exists,
    name: 'Huawei Mobile Partner v23.009.09.01.983',
    description: 'Latest Huawei Mobile Partner with Voice and USSD support for E173 USB Modem',
    filename,
    sizeMB: (size / (1024 * 1024)).toFixed(1),
    downloadUrl: '/api/drivers/huawei-modem',
  });
});

module.exports = router;
