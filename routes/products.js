const express = require('express');
const router = express.Router();
const db = require('../database');

// Product detail page
router.get('/:slug', async (req, res) => {
  try {
    const product = await db.getProduct(req.params.slug);
    if (!product) return res.status(404).render('404', { title: 'Page Not Found', cartCount: 0 });
    
    const [categories, reviews, avgRating, related] = await Promise.all([
      db.getCategories(),
      db.getProductReviews(product.id),
      db.getAverageRating(product.id),
      (async () => {
        const allRelated = await db.getProducts(product.category_slug);
        return allRelated.filter(p => p.id !== product.id).slice(0, 4);
      })()
    ]);
    
    res.render('product', {
      title: `${product.name} — ARODRO`,
      product,
      categories,
      related,
      reviews: Array.isArray(reviews) ? reviews : [],
      avgRating: typeof avgRating === 'object' ? avgRating : { avg: 0, count: 0 },
      cartCount: req.session.cart ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0) : 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
