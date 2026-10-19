// --- 1. SPA LIFECYCLE MANAGEMENT ---
window.initProductDetail = function() {
    // Only query within the fresh, active page wrapper to ignore "ghost" pages
    const wrappers = document.querySelectorAll('.product-details-wrapper:not([data-rendered="true"])');
    wrappers.forEach(wrapper => {
        wrapper.setAttribute('data-rendered', 'true');
        window.loadProductData(wrapper);
    });
};

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", window.initProductDetail);
} else {
    window.initProductDetail();
}

if (!window.pdObserver) {
    window.pdObserver = new MutationObserver(window.initProductDetail);
    window.pdObserver.observe(document.body, { childList: true, subtree: true });
}


// --- 2. SMOOTH TOAST NOTIFICATION ---
window.showCartToast = function() {
    let toast = document.getElementById('cart-success-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-success-toast';
        toast.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px; margin-right:8px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> <span>Added to cart successfully!</span>';
        toast.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 1rem 1.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; font-weight: 500; display: flex; align-items: center; opacity: 0; transform: translateY(-20px); transition: all 0.3s ease; pointer-events: none;';
        document.body.appendChild(toast);
    }
    
    // Animate In
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    
    // Animate Out after 2.5 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
    }, 2500);
};


// --- 3. CORE FETCH & RENDER ---
window.loadProductData = async function(wrapper) {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    if (!productId) return window.renderPDError(wrapper, 'Product not found.');

    try {
        const response = await fetch('/tables4.json');
        if (!response.ok) throw new Error("Failed to load DB");
        const db = await response.json();

        const product = (db.products || []).find(p => p.product_id === productId);
        if (!product || product.is_active === false || product.deleted_at !== null) {
            return window.renderPDError(wrapper, 'Product is unavailable.');
        }

        const variants = (db.product_variants || []).filter(v => v.product_id === productId && v.is_active !== false);
        const media = (db.product_media || []).filter(m => m.product_id === productId).sort((a, b) => a.sort_order - b.sort_order);
        const highlights = (db.product_highlights || []).filter(h => h.product_id === productId && h.is_active !== false).sort((a, b) => a.sort_order - b.sort_order);
        const ingredients = (db.product_ingredients || []).filter(i => i.product_id === productId && i.is_active !== false).sort((a, b) => a.sort_order - b.sort_order);
        const reviews = (db.reviews || []).filter(r => r.product_id === productId && r.is_visible !== false);
        const users = db.users || [];

        // TEXT CONTENT
        const titleEl = wrapper.querySelector('#detail-title');
        if (titleEl) titleEl.textContent = product.name;
        
        const descEl = wrapper.querySelector('#detail-short-desc');
        if (descEl) descEl.textContent = product.short_description;
        
        const longDescEl = wrapper.querySelector('#detail-long-desc-container');
        if (longDescEl) longDescEl.innerHTML = product.long_description.split('\n\n').map(p => `<p>${p}</p>`).join('');

        // CATEGORY BADGE
        const catLink = (db.product_categories || []).find(pc => pc.product_id === productId);
        const catObj = catLink ? (db.categories || []).find(c => c.category_id === catLink.category_id) : null;
        const badgeEl = wrapper.querySelector('#detail-category-badge');
        if (badgeEl) badgeEl.textContent = catObj ? catObj.name : 'Sweet';

        // WISHLIST INITIAL STATE
        const wishlistBtn = wrapper.querySelector('#detail-wishlist-btn');
        if (wishlistBtn) {
            wishlistBtn.setAttribute('data-id', productId);
            let wishlist = JSON.parse(localStorage.getItem('user_wishlist')) || [];
            const isW = wishlist.includes(productId);
            const svg = wishlistBtn.querySelector('svg');
            if(svg) {
                svg.setAttribute('fill', isW ? '#ef4444' : 'none');
                svg.setAttribute('stroke', isW ? '#ef4444' : 'currentColor');
            }
            if (isW) wishlistBtn.classList.add('active-heart');
        }

        // RENDER MODULES
        window.renderPDVariants(wrapper, variants);
        window.renderPDGallery(wrapper, media);
        window.renderPDHighlights(wrapper, highlights, ingredients);
        window.renderPDReviews(wrapper, reviews, users);
        window.renderPDMoreProducts(wrapper, db.products || [], db.product_media || [], db.product_variants || [], productId);

    } catch (error) {
        console.error(error);
        window.renderPDError(wrapper, 'Failed to load details.');
    }
};

window.renderPDError = function(wrapper, msg) {
    wrapper.innerHTML = `<h2 style="text-align:center; padding: 5rem; color: #ef4444;">${msg}</h2>`;
};


// --- 4. RENDER HELPERS ---
window.renderPDVariants = function(wrapper, variants) {
    const selector = wrapper.querySelector('#detail-variant-selector');
    if (!selector) return;

    // Wipe out hardcoded HTML if no variants exist in the DB
    if (variants.length === 0) {
        selector.innerHTML = '<option value="" disabled selected>Out of Stock</option>';
        window.updatePDPriceDisplay(wrapper);
        return;
    }

    selector.innerHTML = variants.map(v => 
        `<option value="${v.variant_id}" data-price="${v.selling_price}" data-original="${v.original_price || v.selling_price}" data-stock="${v.stock_quantity}">
            ${v.weight_value} ${v.weight_unit}
        </option>`
    ).join('');

    window.updatePDPriceDisplay(wrapper);
    selector.addEventListener('change', () => window.updatePDPriceDisplay(wrapper));
};

window.updatePDPriceDisplay = function(wrapper) {
    const selector = wrapper.querySelector('#detail-variant-selector');
    if(!selector) return;
    const selected = selector.options[selector.selectedIndex];
    if(!selected) return;
    
    const sellPrice = parseFloat(selected.getAttribute('data-price'));
    const origPrice = parseFloat(selected.getAttribute('data-original'));
    
    const sellEl = wrapper.querySelector('#detail-selling-price');
    const origEl = wrapper.querySelector('#detail-original-price');
    const tagEl = wrapper.querySelector('#detail-discount-tag');
    
    if(sellEl) sellEl.textContent = `₹ ${sellPrice}`;
    
    if (origPrice > sellPrice) {
        if(origEl) { origEl.textContent = `₹ ${origPrice}`; origEl.style.display = 'inline'; }
        if(tagEl) {
            const discount = Math.round(((origPrice - sellPrice) / origPrice) * 100);
            tagEl.textContent = `(${discount}% OFF)`;
            tagEl.style.display = 'inline';
        }
    } else {
        if(origEl) origEl.style.display = 'none';
        if(tagEl) tagEl.style.display = 'none';
    }
};

window.renderPDGallery = function(wrapper, media) {
    const mainImg = wrapper.querySelector('#detail-main-image');
    const thumbContainer = wrapper.querySelector('#detail-thumbnails-container');
    if (!mainImg || !thumbContainer || media.length === 0) return;

    mainImg.parentNode.style.overflow = 'hidden';

    let videoContainer = wrapper.querySelector('#main-video-player');
    if (!videoContainer) {
        videoContainer = document.createElement('div');
        videoContainer.id = 'main-video-player';
        videoContainer.style.cssText = 'display:none; width:100%; height:100%; border-radius:8px; overflow:hidden;';
        mainImg.parentNode.insertBefore(videoContainer, mainImg.nextSibling);
    }

    let playOverlay = wrapper.querySelector('#main-play-overlay');
    if (!playOverlay) {
        playOverlay = document.createElement('div');
        playOverlay.id = 'main-play-overlay';
        playOverlay.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:64px; color:rgba(255,255,255,0.9); filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));"><path d="M8 5v14l11-7z"/></svg>';
        playOverlay.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); pointer-events:none; display:none; z-index:10;';
        mainImg.parentNode.insertBefore(playOverlay, mainImg.nextSibling);
        mainImg.parentNode.style.position = 'relative';
    }

    thumbContainer.innerHTML = media.map((m, idx) => {
        if (m.media_type === 'video') {
            return `
                <div class="thumb video-thumb" data-index="${idx}">
                    <img src="${m.thumbnail_url || '/media/placeholder.png'}" style="background-color: #E5D9C5; opacity: 0.7;">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:20px; color:white;"><path d="M8 5v14l11-7z"/></svg>
                </div>`;
        } else {
            return `<div class="thumb" data-index="${idx}"><img src="${m.media_url}" style="background-color: #E5D9C5;"></div>`;
        }
    }).join('');

    const thumbs = thumbContainer.querySelectorAll('.thumb');
    let currentIndex = media.findIndex(m => m.is_primary);
    if (currentIndex === -1) currentIndex = 0;

    function updateGallery(index, isUserClick = false, slideDirection = 'right') {
        if (index < 0) index = media.length - 1;
        if (index >= media.length) index = 0;
        currentIndex = index;
        const m = media[currentIndex];

        thumbs.forEach(t => t.classList.remove('active'));
        if(thumbs[currentIndex]) thumbs[currentIndex].classList.add('active');

        if (slideDirection !== 'none' && (m.media_type === 'image' || (m.media_type === 'video' && !isUserClick))) {
            mainImg.style.animation = 'none';
            void mainImg.offsetWidth; 
            mainImg.style.animation = slideDirection === 'right' ? 'slideInRight 0.8s ease-in-out forwards' : 'slideInLeft 0.8s ease-in-out forwards';
        }

        if (m.media_type === 'image') {
            videoContainer.innerHTML = ''; 
            videoContainer.style.display = 'none';
            playOverlay.style.display = 'none';
            mainImg.style.display = 'block';
            mainImg.src = m.media_url;
            mainImg.onclick = null; 
            mainImg.style.cursor = 'default';
        } else if (m.media_type === 'video') {
            if (isUserClick) {
                mainImg.style.display = 'none';
                playOverlay.style.display = 'none';
                videoContainer.style.display = 'block';
                if (m.media_url.includes('youtube.com') || m.media_url.includes('youtu.be')) {
                    let videoId = '';
                    if (m.media_url.includes('v=')) videoId = m.media_url.split('v=')[1].split('&')[0];
                    else if (m.media_url.includes('youtu.be/')) videoId = m.media_url.split('youtu.be/')[1].split('?')[0];
                    videoContainer.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
                } else {
                    videoContainer.innerHTML = `<video width="100%" height="100%" controls autoplay style="background: #000;"><source src="${m.media_url}" type="video/mp4"></video>`;
                }
            } else {
                videoContainer.innerHTML = ''; 
                videoContainer.style.display = 'none';
                mainImg.style.display = 'block';
                mainImg.src = m.thumbnail_url || '/media/placeholder.png';
                playOverlay.style.display = 'block';
                mainImg.style.cursor = 'pointer';
                mainImg.onclick = () => {
                    clearInterval(window.galleryInterval);
                    updateGallery(currentIndex, true, 'none');
                };
            }
        }
    }

    clearInterval(window.galleryInterval);
    updateGallery(currentIndex, false, 'none');
    if (media.length > 1) {
        window.galleryInterval = setInterval(() => updateGallery(currentIndex + 1, false, 'right'), 5000); 
    }

    thumbs.forEach(thumb => {
        thumb.addEventListener('click', function() {
            clearInterval(window.galleryInterval);
            const idx = parseInt(this.getAttribute('data-index'));
            const dir = idx > currentIndex ? 'right' : 'left';
            updateGallery(idx, true, dir);
        });
    });

    const btnPrev = wrapper.querySelector('#gallery-prev');
    if (btnPrev) btnPrev.onclick = (e) => { e.preventDefault(); clearInterval(window.galleryInterval); updateGallery(currentIndex - 1, true, 'left'); };
    
    const btnNext = wrapper.querySelector('#gallery-next');
    if (btnNext) btnNext.onclick = (e) => { e.preventDefault(); clearInterval(window.galleryInterval); updateGallery(currentIndex + 1, true, 'right'); };
};

window.renderPDHighlights = function(wrapper, highlights, ingredients) {
    const highlightsContainer = wrapper.querySelector('#detail-highlights-container');
    const bulletsContainer = wrapper.querySelector('#detail-feature-bullets');
    const ingredientsContainer = wrapper.querySelector('#detail-ingredients-container');

    if (highlightsContainer && bulletsContainer) {
        const svgIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#A05C33"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        bulletsContainer.innerHTML = highlights.map(h => `<li>${svgIcon} ${h.highlight_text}</li>`).join('');
        
        highlightsContainer.innerHTML = highlights.slice(0, 3).map(h => `
            <div class="trust-item">
                <span style="font-size: 1.5rem; color:#F59E0B;">★</span>
                <span>${h.highlight_text}</span>
            </div>
        `).join('');
    }

    if (ingredientsContainer) {
        ingredientsContainer.innerHTML = ingredients.map(i => `
            <span><span class="icon">✨</span> ${i.ingredient_name}</span>
        `).join('');
    }
};

window.renderPDReviews = function(wrapper, reviews, users) {
    const container = wrapper.querySelector('#detail-reviews-container');
    const scoreEl = wrapper.querySelector('#detail-rating-score');
    const countEl = wrapper.querySelector('#detail-review-count');
    const starsEl = wrapper.querySelector('#detail-stars-display');
    const tabBtn = wrapper.querySelector('#tab-btn-reviews');

    if (reviews.length === 0) {
        if(scoreEl) scoreEl.textContent = '0.0';
        if(countEl) countEl.textContent = '(0 reviews)';
        if(starsEl) starsEl.textContent = '☆☆☆☆☆';
        if(tabBtn) tabBtn.textContent = 'Reviews (0)';
        if(container) container.innerHTML = `<p style="color: #6b7280; padding: 2rem 0;">No reviews yet. Be the first to review!</p>`;
        return;
    }

    const avg = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
    const starText = '★'.repeat(Math.floor(avg)) + '☆'.repeat(5 - Math.floor(avg));
    
    if(scoreEl) scoreEl.textContent = avg;
    if(countEl) countEl.textContent = `(${reviews.length} reviews)`;
    if(tabBtn) tabBtn.textContent = `Reviews (${reviews.length})`;
    if(starsEl) starsEl.textContent = starText;

    let reviewsHTML = `
        <div class="review-header-flex">
            <h3 class="section-title" style="margin:0;">Customer Reviews</h3>
        </div>
        <div class="review-score-block">
            <div class="big-score">
                <strong>${avg}</strong> <span>out of 5</span>
                <div class="stars" style="color: #F59E0B;">${starText}</div>
                <span class="small-text">(${reviews.length} reviews)</span>
            </div>
        </div>
    `;

    reviews.forEach(review => {
        const user = users.find(u => u.user_id === review.user_id);
        const reviewerName = user ? `${user.first_name} ${user.last_name}` : 'Verified Customer';
        const initial = reviewerName.charAt(0).toUpperCase();
        const reviewDate = new Date(review.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const reviewStars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

        reviewsHTML += `
            <div class="single-review" style="margin-top: 1.5rem; border-top: 1px solid #e5e7eb; padding-top: 1.5rem;">
                <div class="reviewer-info" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                    <div class="avatar" style="width: 40px; height: 40px; background: #3A100E; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${initial}</div>
                    <div>
                        <strong>${reviewerName}</strong> 
                        ${review.is_verified_purchase ? '<span class="verified" style="color: #10b981; font-size: 0.85rem; margin-left: 0.5rem;">✔ Verified Buyer</span>' : ''}
                        <div class="stars" style="color: #F59E0B; font-size: 0.9rem;">${reviewStars} <span class="date" style="color: #6b7280; margin-left: 0.5rem;">${reviewDate}</span></div>
                    </div>
                </div>
                <p class="review-text" style="color: #374151; line-height: 1.5;">${review.review_text}</p>
            </div>
        `;
    });

    if(container) container.innerHTML = reviewsHTML;
};

window.renderPDMoreProducts = function(wrapper, allProducts, allMedia, allVariants, currentProductId) {
    const container = wrapper.querySelector('#more-products-container');
    if (!container) return;

    const otherProducts = allProducts
        .filter(p => p.product_id !== currentProductId && p.is_active && !p.deleted_at)
        .slice(0, 3);

    if (otherProducts.length === 0) {
        container.innerHTML = '<p style="color: #9ca3af;">No other products available.</p>';
        return;
    }

    container.innerHTML = otherProducts.map(p => {
        const primaryMedia = allMedia.find(m => m.product_id === p.product_id && m.is_primary);
        const imgUrl = primaryMedia ? primaryMedia.media_url : '/media/placeholder.png';
        const defaultVariant = allVariants.find(v => v.product_id === p.product_id && v.is_active);
        
        if (!defaultVariant) return '';

        return `
            <div class="mini-card" onclick="window.location.href='/pages/product.html?id=${p.product_id}'" style="cursor: pointer;">
                <img src="${imgUrl}" alt="${p.name}" style="background-color: #E5D9C5;">
                <div class="mini-card-info">
                    <h4>${p.name}</h4>
                    <div class="mini-price">₹ ${defaultVariant.selling_price} <span>| ${defaultVariant.weight_value} ${defaultVariant.weight_unit}</span></div>
                    <button class="mini-cart-btn" data-variant="${defaultVariant.variant_id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
};


// --- 5. EVENT DELEGATION (Clicks & Tabs) ---
if (!window.pdEventsInitialized) {
    document.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.product-details-wrapper');
        
        // QTY MINUS
        if (e.target.closest('#detail-qty-minus')) {
            if(!wrapper) return;
            const qtyInput = wrapper.querySelector('#detail-qty-input');
            if (qtyInput) {
                let val = parseInt(qtyInput.value);
                if (val > 1) qtyInput.value = val - 1;
            }
        }
        
        // QTY PLUS
        else if (e.target.closest('#detail-qty-plus')) {
            if(!wrapper) return;
            const qtyInput = wrapper.querySelector('#detail-qty-input');
            const selector = wrapper.querySelector('#detail-variant-selector');
            if (qtyInput && selector) {
                let val = parseInt(qtyInput.value);
                const opt = selector.options[selector.selectedIndex];
                const max = parseInt(opt.getAttribute('data-stock') || 99);
                
                if (val < max) qtyInput.value = val + 1;
                else window.showCartToast(); 
            }
        }
        
        // ADD TO CART & BUY NOW
        else if (e.target.closest('#detail-add-to-cart') || e.target.closest('#detail-buy-now')) {
                    if(!wrapper) return;
                    const isBuyNow = e.target.closest('#detail-buy-now');
                    const qtyInput = wrapper.querySelector('#detail-qty-input');
                    const selector = wrapper.querySelector('#detail-variant-selector');
                    
                    if (qtyInput && selector) {
                        const opt = selector.options[selector.selectedIndex];
                        
                        // SECURITY CHECK: Prevents "ghost" IDs (like "250 g") from entering the cart/checkout
                        if (!opt || !opt.hasAttribute('data-price')) {
                            alert("Please wait for product options to fully load.");
                            return;
                        }
        
                        const variantId = opt.value;
                        const qty = parseInt(qtyInput.value);
                        
                        if (isBuyNow) {
                    // FAST LANE: Bypass the cart, save temporary payload, go to checkout page
                    const payload = [{ variant_id: variantId, quantity: qty }];
                    sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
                    
                    // ADD THIS LINE: Tell checkout this is a direct purchase
                    sessionStorage.setItem('checkout_mode', 'buy_now');
                    
                    window.location.href = '/pages/checkout.html';
                        } else {
                            // NORMAL LANE: Add to cart and show toast notification
                            let cart = JSON.parse(localStorage.getItem('user_cart')) || [];
                            const idx = cart.findIndex(i => i.variant_id === variantId);
                            
                            if (idx > -1) cart[idx].quantity += qty;
                            else cart.push({ variant_id: variantId, quantity: qty });
                            
                            localStorage.setItem('user_cart', JSON.stringify(cart));
                            qtyInput.value = 1; 
                            window.showCartToast();
                        }
                    }
        }
        
        // MINI CARDS ADD TO CART
        else if (e.target.closest('.mini-cart-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const btn = e.target.closest('.mini-cart-btn');
            const variantId = btn.getAttribute('data-variant');
            if (!variantId) return;
            
            let cart = JSON.parse(localStorage.getItem('user_cart')) || [];
            const idx = cart.findIndex(i => i.variant_id === variantId);
            
            if (idx > -1) cart[idx].quantity += 1;
            else cart.push({ variant_id: variantId, quantity: 1 });
            
            localStorage.setItem('user_cart', JSON.stringify(cart));
            window.showCartToast();
        }

        // WISHLIST TOGGLE
        else if (e.target.closest('#detail-wishlist-btn')) {
            const btn = e.target.closest('#detail-wishlist-btn');
            const pId = btn.getAttribute('data-id');
            if(!pId) return;
            
            let w = JSON.parse(localStorage.getItem('user_wishlist')) || [];
            if (w.includes(pId)) w = w.filter(id => id !== pId);
            else w.push(pId);
            localStorage.setItem('user_wishlist', JSON.stringify(w));
            
            const svg = btn.querySelector('svg');
            if (w.includes(pId)) {
                btn.classList.add('active-heart');
                if(svg) { svg.setAttribute('fill', '#ef4444'); svg.setAttribute('stroke', '#ef4444'); }
            } else {
                btn.classList.remove('active-heart');
                if(svg) { svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); }
            }
        }

        // TAB SWITCHING (Smooth Scrolling)
        else if (e.target.closest('.product-deep-dive .tab-btn')) {
            if(!wrapper) return;
            const btn = e.target.closest('.tab-btn');
            
            const allBtns = wrapper.querySelectorAll('.tab-btn');
            allBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const target = btn.getAttribute('data-target');
            if (target === 'desc') {
                const el = wrapper.querySelector('#detail-long-desc-container');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (target === 'ingredients') {
                const el = wrapper.querySelector('#detail-ingredients-container');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (target === 'reviews') {
                const el = wrapper.querySelector('#detail-reviews-container');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });

    window.pdEventsInitialized = true;
}