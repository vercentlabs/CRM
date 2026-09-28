
import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  const uptime = process.uptime();
  const timestamp = new Date().toISOString();

  res.json({
    status: 'OK',
    uptime: uptime,
    timestamp: timestamp
  });
});

export default router;
