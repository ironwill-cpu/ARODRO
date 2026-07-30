const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

async function ensureBucket() {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.storage.getBucket('arodro');
    if (error && error.message.includes('not found')) {
      await supabase.storage.createBucket('arodro', { public: true });
      console.log('✓ Storage bucket "arodro" created');
    } else if (!error) {
      console.log('✓ Storage bucket "arodro" exists');
    }
    return true;
  } catch (e) {
    console.log('Storage setup skipped:', e.message);
    return false;
  }
}

async function uploadImage(filePath, filename) {
  if (!supabase) {
    // Fallback to local upload
    return { url: `/uploads/products/${filename}`, local: true };
  }
  
  const fileBuffer = fs.readFileSync(filePath);
  const { data, error } = await supabase.storage
    .from('arodro')
    .upload(`products/${filename}`, fileBuffer, {
      contentType: 'image/' + path.extname(filename).slice(1),
      upsert: true
    });
  
  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('arodro')
    .getPublicUrl(`products/${filename}`);
  
  return { url: publicUrl, local: false };
}

async function deleteImage(filename) {
  if (!supabase) return;
  await supabase.storage.from('arodro').remove([`products/${filename}`]);
}

async function uploadSettingsImage(settingKey, filePath) {
  if (!supabase) return `/uploads/settings/${path.basename(filePath)}`;
  
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath);
  const { error } = await supabase.storage
    .from('arodro')
    .upload(`settings/${settingKey}${ext}`, fileBuffer, { upsert: true });
  
  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('arodro')
    .getPublicUrl(`settings/${settingKey}${ext}`);
  
  return publicUrl;
}

module.exports = { supabase, ensureBucket, uploadImage, deleteImage, uploadSettingsImage };
