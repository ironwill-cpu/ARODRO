/* ARODRO Cosmetics - Main JavaScript */

document.addEventListener('DOMContentLoaded', function() {

  // Hero Auto-Slider
  const heroSlider = document.getElementById('heroSlider');
  if (heroSlider) {
    const slides = heroSlider.querySelectorAll('.hero-slide');
    const dots = heroSlider.querySelectorAll('.hero-dot');
    let current = 0;
    let timer = null;

    function goToSlide(index) {
      slides.forEach(s => s.classList.remove('active'));
      dots.forEach(d => d.classList.remove('active'));
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
    }

    function nextSlide() { goToSlide(current + 1); }

    function startAuto() {
      if (slides.length < 2) return;
      stopAuto();
      timer = setInterval(nextSlide, 5000);
    }

    function stopAuto() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    dots.forEach(dot => {
      dot.addEventListener('click', function() {
        goToSlide(parseInt(this.dataset.slide));
        startAuto(); // restart timer after manual nav
      });
    });

    heroSlider.addEventListener('mouseenter', stopAuto);
    heroSlider.addEventListener('mouseleave', startAuto);

    startAuto();
  }

  // Mobile Menu Toggle
  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');
  
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      mainNav.classList.toggle('active');
    });
    
    document.addEventListener('click', function(e) {
      if (!mainNav.contains(e.target) && !menuToggle.contains(e.target)) {
        mainNav.classList.remove('active');
      }
    });
  }

  // Search Toggle
  const searchToggle = document.getElementById('searchToggle');
  const searchBar = document.getElementById('searchBar');
  const searchClose = document.getElementById('searchClose');
  
  if (searchToggle && searchBar) {
    searchToggle.addEventListener('click', function() {
      searchBar.classList.toggle('active');
      if (searchBar.classList.contains('active')) {
        setTimeout(() => {
          searchBar.querySelector('.search-input').focus();
        }, 100);
      }
    });
    
    if (searchClose) {
      searchClose.addEventListener('click', function() {
        searchBar.classList.remove('active');
      });
    }
  }

  // Quantity Selector
  initializeQuantitySelectors();

  // Add to Cart
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const productId = this.dataset.id;
      let quantity = 1;
      
      const qtyInput = this.closest('.product-actions-detail')?.querySelector('#qtyInput');
      if (qtyInput) quantity = parseInt(qtyInput.value) || 1;
      
      addToCart(productId, quantity);
    });
  });

  // Cart quantity updates
  document.querySelectorAll('.cart-qty-plus').forEach(btn => {
    btn.addEventListener('click', function() {
      const input = this.parentElement.querySelector('.cart-qty-input');
      const form = this.closest('.cart-qty-form');
      input.value = parseInt(input.value) + 1;
      form.submit();
    });
  });

  document.querySelectorAll('.cart-qty-minus').forEach(btn => {
    btn.addEventListener('click', function() {
      const input = this.parentElement.querySelector('.cart-qty-input');
      const form = this.closest('.cart-qty-form');
      const val = parseInt(input.value) - 1;
      if (val > 0) {
        input.value = val;
        form.submit();
      } else {
        const removeForm = form.closest('.cart-item').querySelector('.cart-item-remove form');
        if (removeForm) removeForm.submit();
      }
    });
  });

  // Toast
  window.showToast = function(message, icon = 'fa-check-circle') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.querySelector('.toast-message').textContent = message;
    toast.querySelector('.toast-icon').className = `fas ${icon} toast-icon`;
    toast.classList.add('show');
    
    setTimeout(() => toast.classList.remove('show'), 3000);
  };
});

// Add to Cart function
function addToCart(productId, quantity = 1) {
  fetch('/cart/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ product_id: productId, quantity: quantity })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      const badges = document.querySelectorAll('.cart-badge');
      badges.forEach(badge => badge.textContent = data.cartCount);
      
      showToast(data.message || 'Added to cart! ✨');
      
      document.querySelectorAll('.cart-btn').forEach(btn => {
        btn.style.transform = 'scale(1.2)';
        setTimeout(() => btn.style.transform = 'scale(1)', 200);
      });
    } else {
      showToast(data.message || 'Error adding to cart', 'fa-exclamation-circle');
    }
  })
  .catch(err => {
    showToast('Something went wrong', 'fa-exclamation-circle');
    console.error('Cart error:', err);
  });
}

// Quantity selector initialization
function initializeQuantitySelectors() {
  document.querySelectorAll('.quantity-selector:not(.initialized)').forEach(container => {
    container.classList.add('initialized');
    
    const minusBtn = container.querySelector('.qty-btn:first-child');
    const plusBtn = container.querySelector('.qty-btn:last-child');
    const input = container.querySelector('input[type="number"]');
    
    if (minusBtn && plusBtn && input) {
      minusBtn.addEventListener('click', function() {
        const current = parseInt(input.value);
        if (current > 1) input.value = current - 1;
        input.dispatchEvent(new Event('change'));
      });
      
      plusBtn.addEventListener('click', function() {
        const current = parseInt(input.value);
        const max = parseInt(input.max) || 99;
        if (current < max) input.value = current + 1;
        input.dispatchEvent(new Event('change'));
      });
    }
  });
}

// Newsletter form
const newsletterForm = document.getElementById('newsletterForm');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', function(e) {
    e.preventDefault();
    showToast('Thank you for subscribing! 🎉');
    this.reset();
  });
}

// Contact form
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', function(e) {
    e.preventDefault();
    showToast('Message sent! We\'ll get back to you soon. ✨');
    this.reset();
  });
}

// === WISHLIST ===
window.toggleWishlist = function(btn, productId) {
  fetch('/wishlist/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ product_id: productId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      if (data.added) {
        btn.classList.add('active');
        btn.querySelector('i').className = 'fas fa-heart';
        showToast('Added to wishlist 💝');
        document.querySelectorAll(`.wishlist-btn[data-id="${productId}"]`).forEach(b => {
          b.classList.add('active');
          b.querySelector('i').className = 'fas fa-heart';
        });
      } else {
        btn.classList.remove('active');
        btn.querySelector('i').className = 'far fa-heart';
        showToast('Removed from wishlist');
        document.querySelectorAll(`.wishlist-btn[data-id="${productId}"]`).forEach(b => {
          b.classList.remove('active');
          b.querySelector('i').className = 'far fa-heart';
        });
        if (window.location.pathname === '/wishlist') {
          const card = btn.closest('.product-card');
          if (card) {
            card.style.opacity = '0';
            setTimeout(() => { if (card.parentNode) card.remove(); }, 300);
          }
        }
      }
    }
  })
  .catch(err => {
    showToast('Error updating wishlist', 'fa-exclamation-circle');
    console.error(err);
  });
};

// === REVIEWS ===
window.submitReview = function(form) {
  const formData = new FormData(form);
  const data = {};
  formData.forEach((value, key) => data[key] = value);
  
  fetch('/reviews/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(res => res.json())
  .then(result => {
    if (result.success) {
      showToast('Review submitted! Thank you 🌟');
      form.reset();
      const ratingEl = document.getElementById('avgRating');
      if (ratingEl) {
        ratingEl.innerHTML = '';
        for (let i = 0; i < 5; i++) {
          const star = document.createElement('i');
          star.className = i < Math.round(result.avg) ? 'fas fa-star' : 'far fa-star';
          star.style.color = '#c4975a';
          ratingEl.appendChild(star);
        }
      }
      const countEl = document.getElementById('ratingCount');
      if (countEl) countEl.textContent = `(${result.count} reviews)`;
    } else {
      showToast(result.message || 'Error submitting review', 'fa-exclamation-circle');
    }
  })
  .catch(err => {
    showToast('Error submitting review', 'fa-exclamation-circle');
    console.error(err);
  });
  
  return false;
};

// Star rating input handler
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.star-rating-input').forEach(container => {
    const stars = container.querySelectorAll('i');
    const input = container.querySelector('input[type="hidden"]');
    
    stars.forEach(star => {
      star.addEventListener('click', function() {
        const rating = this.dataset.value;
        input.value = rating;
        stars.forEach((s, i) => {
          s.className = i < rating ? 'fas fa-star' : 'far fa-star';
        });
      });
      
      star.addEventListener('mouseenter', function() {
        const rating = this.dataset.value;
        stars.forEach((s, i) => {
          s.className = i < rating ? 'fas fa-star' : 'far fa-star';
        });
      });
      
      star.addEventListener('mouseleave', function() {
        const currentRating = parseInt(input.value) || 0;
        stars.forEach((s, i) => {
          s.className = i < currentRating ? 'fas fa-star' : 'far fa-star';
        });
      });
    });
  });
});

// === COUPONS ===
window.applyCoupon = function() {
  const input = document.getElementById('couponCode');
  const code = input ? input.value.trim() : '';
  if (!code) return showToast('Enter a coupon code', 'fa-exclamation-circle');
  
  // Get subtotal from the page
  const subtotalEl = document.querySelector('.summary-row:first-child span:last-child');
  const subtotal = subtotalEl ? parseInt(subtotalEl.textContent.replace(/[^0-9]/g, '')) : 0;
  
  fetch('/coupons/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotal })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast(data.message || 'Coupon applied! 🎉');
      setTimeout(() => location.reload(), 800);
    } else {
      showToast(data.message || 'Invalid coupon', 'fa-exclamation-circle');
      const msg = document.getElementById('couponMessage');
      if (msg) {
        msg.className = 'coupon-message coupon-error';
        msg.innerHTML = '<i class="fas fa-times-circle"></i> ' + (data.message || 'Invalid code');
      }
    }
  })
  .catch(() => showToast('Error applying coupon', 'fa-exclamation-circle'));
};

window.removeCoupon = function() {
  fetch('/coupons/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(res => res.json())
  .then(() => {
    showToast('Coupon removed');
    setTimeout(() => location.reload(), 500);
  });
};
