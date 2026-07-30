const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

console.log('✓ Upload route module loaded');

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../public/uploads/products');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = uuidv4().substring(0, 8) + Date.now().toString(36);
    cb(null, name + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, WebP & GIF files are allowed'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Test route
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Upload route is working!' });
});

// Single image upload
router.post('/single', upload.single('image'), (req, res) => {
  console.log('Upload /single called, file:', req.file ? req.file.filename : 'none');
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const url = '/uploads/products/' + req.file.filename;
  res.json({ success: true, url, filename: req.file.filename });
});

// Multiple images upload
router.post('/multiple', upload.array('images', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }
  const urls = req.files.map(f => '/uploads/products/' + f.filename);
  res.json({ success: true, urls });
});

// Delete image
router.post('/delete', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ success: false });
  
  const filePath = path.join(__dirname, '../public/uploads/products', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'File not found' });
  }
});

// Error handler
router.use((err, req, res, next) => {
  console.error('Upload error:', err.message);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large (max 5MB)' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

module.exports = router;
