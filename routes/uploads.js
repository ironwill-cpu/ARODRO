const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const supabaseStorage = require('../storage');

console.log('✓ Upload route module loaded');

// Configure local temp storage
const tmpStorage = multer.diskStorage({
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
  storage: tmpStorage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Test route
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Upload route is working!' });
});

// Helper: upload file to Supabase (or fallback to local)
async function uploadToCloud(localPath, filename) {
  // Try Supabase Storage first
  try {
    const result = await supabaseStorage.uploadImage(localPath, filename);
    if (!result.local) {
      return { url: result.url, cloud: true };
    }
  } catch (e) {
    console.log('Supabase upload failed, using local:', e.message);
  }
  // Fallback to local
  return { url: '/uploads/products/' + filename, cloud: false };
}

// Single image upload
router.post('/single', upload.single('image'), async (req, res) => {
  console.log('Upload /single called, file:', req.file ? req.file.filename : 'none');
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  
  const result = await uploadToCloud(req.file.path, req.file.filename);
  res.json({ success: true, url: result.url, filename: req.file.filename, cloud: result.cloud });
});

// Upload one gallery image at a time (for progress tracking)
router.post('/gallery', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  
  const result = await uploadToCloud(req.file.path, req.file.filename);
  res.json({ 
    success: true, 
    url: result.url, 
    filename: req.file.filename, 
    cloud: result.cloud,
    name: req.file.originalname
  });
});

// Multiple images upload (batch - legacy support)
router.post('/multiple', upload.array('images', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }
  
  const results = [];
  for (const file of req.files) {
    const result = await uploadToCloud(file.path, file.filename);
    results.push({ url: result.url, filename: file.filename, cloud: result.cloud });
  }
  
  res.json({ success: true, urls: results.map(r => r.url) });
});

// Delete image from storage
router.post('/delete', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'No URL provided' });
  
  // If it's a Supabase URL, try to delete from Supabase
  if (url.includes('supabase.co')) {
    try {
      // Extract the filename from the URL
      // URL format: https://xxx.supabase.co/storage/v1/object/public/arodro/products/filename.jpg
      const parts = url.split('/');
      const bucketIndex = parts.findIndex(p => p === 'arodro');
      if (bucketIndex !== -1) {
        const objectPath = parts.slice(bucketIndex + 1).join('/');
        await supabaseStorage.supabase.storage.from('arodro').remove([objectPath]);
        console.log('Deleted from Supabase:', objectPath);
      }
    } catch (e) {
      console.log('Supabase delete failed:', e.message);
      // Continue anyway - file might not exist anymore
    }
  }
  
  // If it's a local path, try to find and delete the local file
  if (url.startsWith('/uploads/')) {
    const localPath = path.join(__dirname, '../public', url);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log('Deleted local file:', localPath);
    }
  }
  
  res.json({ success: true });
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
