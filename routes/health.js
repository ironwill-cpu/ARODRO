const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', async (req, res) => {
  try {
    let dbStatus = 'ok';
    let dbError = null;
    try {
      await db.getCategories();
    } catch (dbErr) {
      dbStatus = 'error';
      dbError = dbErr.message;
    }

    const uptime = process.uptime ? process.uptime() : 0;

    res.json({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      uptime,
      db: dbStatus,
      error: dbError
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
