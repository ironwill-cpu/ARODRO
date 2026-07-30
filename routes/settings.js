const express = require('express');
const router = express.Router();
const db = require('../database');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Multer config for settings images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'public', 'uploads', 'settings');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const key = req.body.setting_key || 'image';
    cb(null, `${key}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowed.includes(ext));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

// Auth middleware
router.use((req, res, next) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  next();
});

// Settings page
router.get('/', async (req, res) => {
  const settings = await db.getAllSettings();
  const categories = await db.getCategories();
  
  // Group settings
  const groups = {};
  settings.forEach(s => {
    if (!groups[s.group_name]) groups[s.group_name] = [];
    groups[s.group_name].push(s);
  });
  
  res.render('admin/settings', {
    title: 'Website Settings — ARODRO Admin',
    groups, settings,
    categories,
    cartCount: 0,
    admin: req.session.admin,
    message: req.query.saved ? 'Settings saved successfully - Restart recommended for color changes to take effect 💡' : null
  });
});

// Update single setting (AJAX)
router.post('/update', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'Key required' });
    await db.updateSetting(key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Batch update from form
router.post('/batch', async (req, res) => {
  try {
    const entries = Object.entries(req.body).filter(([key]) => key.startsWith('setting_'));
    for (const [key, value] of entries) {
      const settingKey = key.replace('setting_', '');
      await db.updateSetting(settingKey, value);
    }
    res.redirect('/admin/settings?saved=1');
  } catch (err) {
    res.status(500).send('Error saving settings: ' + err.message);
  }
});

// Upload image
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = `/uploads/settings/${req.file.filename}`;
    await db.updateSetting(req.body.setting_key, url);
    res.json({ success: true, url, message: 'Image uploaded!', filename: req.file.filename });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
