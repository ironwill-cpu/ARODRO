require('dotenv').config();
const { initDb, createCategory, createProduct, getDb } = require('./database');

async function seed() {
  console.log('🌱 Seeding ARODRO database...\n');
  
  await initDb();
  const db = await getDb();
  
  // Clear existing data
  db.run('DELETE FROM order_items');
  db.run('DELETE FROM orders');
  db.run('DELETE FROM products');
  db.run('DELETE FROM categories');
  
  // Categories
  const categories = [
    {
      name: 'Skincare',
      description: 'Nourish your skin with our premium skincare collection — cleansers, serums, moisturizers, and more.',
      image: '/images/category-skincare.jpg'
    },
    {
      name: 'Makeup',
      description: 'Transform your look with ARODRO cosmetics — from foundation to lipstick, express your beauty.',
      image: '/images/category-makeup.jpg'
    },
    {
      name: 'Haircare',
      description: 'Luxurious haircare solutions for every hair type. Shampoos, conditioners, oils, and treatments.',
      image: '/images/category-haircare.jpg'
    },
    {
      name: 'Fragrance',
      description: 'Captivating fragrances that leave a lasting impression. Discover your signature scent.',
      image: '/images/category-fragrance.jpg'
    }
  ];
  
  for (const cat of categories) {
    const slug = await createCategory(cat);
    console.log(`  ✓ Category created: ${cat.name} (${slug})`);
  }
  
  // Products
  const products = [
    // Skincare
    { name: 'Radiance Glow Serum', category: 'Skincare', price: 1250, compare_price: 1500, short_description: 'Vitamin C brightening serum with hyaluronic acid for radiant skin.', description: 'Our Radiance Glow Serum is a powerful vitamin C formula enriched with hyaluronic acid and natural botanicals. This lightweight serum penetrates deep to brighten dull skin, reduce dark spots, and boost collagen production. Perfect for all skin types.', ingredients: 'Vitamin C, Hyaluronic Acid, Vitamin E, Green Tea Extract, Aloe Vera', weight: '30ml', stock: 50, featured: 1 },
    { name: 'Hydra Moisture Cream', category: 'Skincare', price: 890, compare_price: 1100, short_description: 'Intense 24-hour hydration cream with ceramides.', description: 'A rich yet lightweight moisturizer that provides 24-hour hydration. Formulated with ceramides and peptides to strengthen the skin barrier, reduce fine lines, and leave your skin plump and dewy.', ingredients: 'Ceramides, Peptides, Shea Butter, Jojoba Oil, Glycerin', weight: '50g', stock: 40, featured: 1 },
    { name: 'Gentle Cleansing Foam', category: 'Skincare', price: 650, short_description: 'PH-balanced foaming cleanser with soothing green tea.', description: 'A gentle, pH-balanced foaming cleanser that effectively removes makeup, dirt, and excess oil without stripping your skin. Enriched with green tea extract and chamomile to soothe and refresh.', ingredients: 'Green Tea Extract, Chamomile, Aloe Vera, Glycerin', weight: '150ml', stock: 60 },
    { name: 'Retinol Night Cream', category: 'Skincare', price: 1450, compare_price: 1800, short_description: 'Anti-aging night cream with retinol and peptides.', description: 'Our advanced night cream combines retinol with peptides and antioxidants to reduce fine lines, improve skin texture, and restore youthful radiance while you sleep.', ingredients: 'Retinol, Peptides, Vitamin E, Rosehip Oil, Niacinamide', weight: '50g', stock: 30, featured: 1 },
    { name: 'Brightening Face Mask', category: 'Skincare', price: 350, short_description: 'Sheet mask infused with vitamin C and niacinamide.', description: 'An ultra-hydrating sheet mask soaked in vitamin C and niacinamide serum. Brightens, hydrates, and revitalizes tired skin in just 15 minutes. Perfect for weekly pampering.', weight: '25g (1 sheet)', stock: 100 },
    { name: 'Sun Protection SPF 50', category: 'Skincare', price: 780, short_description: 'Lightweight, non-greasy broad-spectrum SPF 50 sunscreen.', description: 'A feather-light sunscreen that offers broad-spectrum protection without the white cast. Infused with aloe vera and vitamin E for added skincare benefits. Water-resistant for 80 minutes.', ingredients: 'Zinc Oxide, Aloe Vera, Vitamin E, Niacinamide', weight: '60ml', stock: 45 },
    
    // Makeup
    { name: 'Velvet Matte Lipstick', category: 'Makeup', price: 890, compare_price: 1200, short_description: 'Long-lasting matte lipstick with a velvety finish.', description: 'ARODRO Velvet Matte Lipstick glides on smoothly and stays put for up to 12 hours. Enriched with shea butter and vitamin E, it keeps your lips moisturized while delivering intense color payoff.', ingredients: 'Shea Butter, Vitamin E, Jojoba Oil, Beeswax', weight: '4g', stock: 80, featured: 1 },
    { name: 'Luminous Foundation', category: 'Makeup', price: 1200, short_description: 'Buildable coverage foundation with a natural luminous finish.', description: 'A lightweight, buildable foundation that evens out skin tone and provides a natural luminous finish. Infused with hyaluronic acid for hydration and SPF 20 for sun protection. Available in 8 shades.', ingredients: 'Hyaluronic Acid, Vitamin E, SPF 20, Silica', weight: '30ml', stock: 35, featured: 1 },
    { name: 'Perfect Brow Pencil', category: 'Makeup', price: 450, short_description: 'Precision brow pencil with spoolie brush.', description: 'Create natural-looking brows with our ultra-fine precision pencil. The twist-up design never needs sharpening, and the built-in spoolie brush lets you blend for a flawless finish.', weight: '0.09g', stock: 90 },
    { name: 'Eyeshadow Palette', category: 'Makeup', price: 1650, compare_price: 2000, short_description: '12-shade neutral eyeshadow palette — matte to shimmer.', description: 'A versatile 12-shade eyeshadow palette featuring a perfect mix of matte, satin, and shimmer finishes. Highly pigmented, blendable, and long-wearing. From everyday neutrals to smoky glam.', weight: '15g', stock: 25, featured: 1 },
    { name: 'Waterproof Eyeliner', category: 'Makeup', price: 550, short_description: 'Smudge-proof liquid eyeliner with ultra-fine tip.', description: 'Achieve perfect winged liner with our precision liquid eyeliner. The ultra-fine felt tip allows for both thin and bold lines. Waterproof formula lasts all day without smudging or flaking.', weight: '1.2ml', stock: 70 },
    { name: 'Highlighting Powder', category: 'Makeup', price: 980, short_description: 'Baked highlighter for a natural, lit-from-within glow.', description: 'Our silky baked highlighter gives you a beautiful, natural glow. The finely-milled powder blends seamlessly into skin and can be built from a subtle sheen to a dazzling highlight.', weight: '8g', stock: 40 },
    
    // Haircare
    { name: 'Argan Oil Hair Serum', category: 'Haircare', price: 750, compare_price: 950, short_description: 'Lightweight argan oil serum for frizz-free, shiny hair.', description: 'Nourish your hair with our lightweight argan oil serum. Tames frizz, adds brilliant shine, and protects against heat styling up to 230°C. Suitable for all hair types, especially dry and damaged hair.', ingredients: 'Argan Oil, Keratin, Vitamin E, Silicone-free formula', weight: '50ml', stock: 55, featured: 1 },
    { name: 'Sulfate-Free Shampoo', category: 'Haircare', price: 680, short_description: 'Gentle sulfate-free shampoo with biotin and coconut oil.', description: 'A gentle, sulfate-free shampoo that cleanses without stripping natural oils. Enriched with biotin for strength and coconut oil for moisture. Safe for color-treated and keratin-treated hair.', ingredients: 'Biotin, Coconut Oil, Aloe Vera, Vitamin B5', weight: '250ml', stock: 40 },
    { name: 'Deep Conditioner Mask', category: 'Haircare', price: 890, short_description: 'Intensive hair mask with shea butter and avocado oil.', description: 'An intensive deep conditioning treatment that repairs damaged hair, restores moisture, and improves elasticity. Use weekly for salon-quality results at home.', ingredients: 'Shea Butter, Avocado Oil, Keratin, Vitamin E', weight: '200g', stock: 35, featured: 1 },
    { name: 'Hair Growth Oil', category: 'Haircare', price: 550, short_description: 'Natural hair growth oil with rosemary and castor oil.', description: 'A blend of natural oils including rosemary, castor, and jojoba oil that stimulates hair follicles, promotes growth, and reduces hair fall. Massage into scalp nightly for best results.', ingredients: 'Rosemary Oil, Castor Oil, Jojoba Oil, Vitamin E, Peppermint Oil', weight: '60ml', stock: 65 },
    { name: 'Leave-In Conditioner', category: 'Haircare', price: 620, short_description: 'Detangling leave-in spray with UV protection.', description: 'A lightweight leave-in conditioner that detangles, hydrates, and protects hair from UV damage. Spray on damp or dry hair for instant manageability and a healthy shine.', ingredients: 'Aloe Vera, Vitamin B5, UV Filters, Silk Proteins', weight: '150ml', stock: 45 },
    
    // Fragrance
    { name: 'Bloom Eau de Parfum', category: 'Fragrance', price: 2200, compare_price: 2800, short_description: 'A feminine floral fragrance with notes of rose and jasmine.', description: 'Bloom is a captivating floral fragrance that opens with fresh bergamot and pear, blooms with rose and jasmine at its heart, and settles into a warm base of musk and sandalwood. Long-lasting EDP concentration.', weight: '50ml', stock: 20, featured: 1 },
    { name: 'Midnight Oud', category: 'Fragrance', price: 2800, compare_price: 3500, short_description: 'Luxurious oriental fragrance with oud and amber.', description: 'A sophisticated oriental fragrance for those who appreciate luxury. Top notes of saffron and bergamot give way to a heart of oud and rose, resting on a base of amber, musk, and patchouli.', weight: '50ml', stock: 15, featured: 1 },
    { name: 'Fresh Citrus Body Mist', category: 'Fragrance', price: 450, short_description: 'Light, refreshing body mist with citrus and green tea.', description: 'A refreshing body mist perfect for everyday wear. Zesty notes of lemon, mandarin, and grapefruit blend with green tea and a touch of musk for a clean, energizing scent.', weight: '100ml', stock: 75 },
    { name: 'Velvet Rose Perfume Oil', category: 'Fragrance', price: 650, short_description: 'Concentrated perfume oil with Bulgarian rose.', description: 'A concentrated perfume oil that lasts all day. The rich scent of Bulgarian rose is complemented by warm vanilla and sandalwood. Roll-on format for easy, mess-free application.', weight: '10ml', stock: 50 },
  ];
  
  // Get categories from db for mapping
  const catStmt = db.prepare('SELECT id, name FROM categories');
  const catMap = {};
  while (catStmt.step()) {
    const row = catStmt.getAsObject();
    catMap[row.name] = row.id;
  }
  catStmt.free();
  
  for (const prod of products) {
    await createProduct({
      ...prod,
      category_id: catMap[prod.category],
      images: '[]'
    });
    console.log(`  ✓ Product created: ${prod.name} (৳${prod.price})`);
  }
  
  console.log('\n✨ Seed completed successfully!');
  console.log(`   📦 ${categories.length} categories`);
  console.log(`   🧴 ${products.length} products`);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
