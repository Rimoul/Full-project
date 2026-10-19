// --- 1. DEFINE FUNCTIONS FIRST (To prevent SPA hoisting crashes) ---
window.loadCartData = async function(container) {
    try {
        const response = await fetch('/tables4.json');
        if (!response.ok) throw new Error("Failed to load database");
        const db = await response.json();
        
        window.renderCartUI(db, container);
    } catch (error) {
        console.error("Error loading cart data:", error);
        container.innerHTML = '<h3 style="text-align:center; padding:3rem;">Failed to load cart items.</h3>';
    }
};

window.renderCartUI = function(db, container) {
    const wrapper = container.closest('.cart-page-wrapper');
    if (!wrapper) return;

    let rawCart = JSON.parse(localStorage.getItem('user_cart')) || [];
    
    // Self-Healing Logic: Purge corrupted data instantly
    const validCart = rawCart.filter(item => {
        if (!item || !item.variant_id || isNaN(item.quantity) || item.quantity <= 0) return false;
        return (db.product_variants || []).some(v => String(v.variant_id) === String(item.variant_id));
    });

    if (validCart.length !== rawCart.length) {
        localStorage.setItem('user_cart', JSON.stringify(validCart));
    }
    let cart = validCart;
    
    // TRUE EMPTY STATE
    if (cart.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 5rem 1rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 80px; height: 80px; color: #9ca3af; margin-bottom: 1.5rem;"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                <h2 style="font-size: 1.5rem; color: #374151; margin-bottom: 1rem;">Your cart is empty</h2>
                <p style="color: #6b7280; margin-bottom: 2rem;">Looks like you haven't added any traditional sweets yet.</p>
                <a href="/pages/all-products.html" class="btn-checkout" style="display: inline-block; width: auto; padding: 1rem 2rem; text-decoration: none;">Start Shopping</a>
            </div>
        `;
        window.updateOrderSummary(0, 0, 0, wrapper);
        
        const endList = wrapper.querySelector('#cart-end-list');
        if(endList) endList.style.display = 'none';
        
        return;
    }

    let subtotal = 0;
    let totalOriginal = 0;
    let totalItemCount = 0;
    let html = '';

    cart.forEach(cartItem => {
        const variant = (db.product_variants || []).find(v => String(v.variant_id) === String(cartItem.variant_id));
        if (!variant) return; 
        
        const product = (db.products || []).find(p => String(p.product_id) === String(variant.product_id));
        if (!product) return;
        
        const media = (db.product_media || []).find(m => String(m.product_id) === String(product.product_id) && m.is_primary) || (db.product_media || []).find(m => String(m.product_id) === String(product.product_id));
        const imgUrl = media ? media.media_url : '/media/placeholder.png';
        
        const catLink = (db.product_categories || []).find(pc => String(pc.product_id) === String(product.product_id));
        const catObj = catLink ? (db.categories || []).find(c => String(c.category_id) === String(catLink.category_id)) : null;
        const catName = catObj ? catObj.name : 'Sweet';

        const qty = parseInt(cartItem.quantity);
        const sellPrice = parseFloat(variant.selling_price);
        const origPrice = parseFloat(variant.original_price || variant.selling_price);
        
        subtotal += (sellPrice * qty);
        totalOriginal += (origPrice * qty);
        totalItemCount += qty;
        
        const discountPercent = origPrice > sellPrice ? Math.round(((origPrice - sellPrice) / origPrice) * 100) : 0;

        html += `
            <div class="cart-item">
                <img src="${imgUrl}" alt="${product.name}" class="item-img" style="background-color: #E5D9C5;">
                <div class="item-details">
                    <div class="item-title-row">
                        <h3>${product.name}</h3>
                        <span class="category-badge">${catName}</span>
                    </div>
                    <span class="item-weight">${variant.weight_value} ${variant.weight_unit}</span>
                    <p class="item-desc desktop-only">${product.short_description}</p>
                </div>
                <div class="item-actions-price">
                    <div class="price-block">
                        <span class="current-price">₹${sellPrice}</span>
                        ${discountPercent > 0 ? `<span class="original-price">₹${origPrice}</span> <span class="discount-tag">(${discountPercent}% OFF)</span>` : ''}
                    </div>
                    <div class="controls-block">
                        <div class="qty-controls">
                            <button class="qty-minus" data-id="${variant.variant_id}">&minus;</button>
                            <input type="text" value="${qty}" readonly>
                            <button class="qty-plus" data-id="${variant.variant_id}" data-stock="${variant.stock_quantity}">&plus;</button>
                        </div>
                        <button class="btn-remove remove-item" data-id="${variant.variant_id}" aria-label="Remove item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    if (html === '') {
        container.innerHTML = `
            <div style="text-align: center; padding: 5rem 1rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 80px; height: 80px; color: #9ca3af; margin-bottom: 1.5rem;"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                <h2 style="font-size: 1.5rem; color: #374151; margin-bottom: 1rem;">Your cart is empty</h2>
                <p style="color: #6b7280; margin-bottom: 2rem;">Looks like you haven't added any traditional sweets yet.</p>
                <a href="/pages/all-products.html" class="btn-checkout" style="display: inline-block; width: auto; padding: 1rem 2rem; text-decoration: none;">Start Shopping</a>
            </div>
        `;
        window.updateOrderSummary(0, 0, 0, wrapper);
        const endList = wrapper.querySelector('#cart-end-list');
        if(endList) endList.style.display = 'none';
        return;
    }

    container.innerHTML = html;
    
    const endList = wrapper.querySelector('#cart-end-list');
    const endCount = wrapper.querySelector('#cart-end-count');
    if (endList && endCount) {
        endList.style.display = 'block';
        endCount.innerHTML = `${totalItemCount} items in your cart`;
    }

    window.updateOrderSummary(subtotal, totalOriginal, totalItemCount, wrapper);
};

window.updateOrderSummary = function(subtotal, totalOriginal, totalItemCount, wrapper) {
    const FREE_SHIPPING_THRESHOLD = 499;
    const SHIPPING_FEE = 49;
    
    const totalDiscount = totalOriginal - subtotal;
    const requiresShipping = (subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD);
    const shippingCost = requiresShipping ? SHIPPING_FEE : 0;
    const finalTotal = subtotal + shippingCost;

    const headerCount = wrapper.querySelector('#cart-item-count-header');
    if (headerCount) headerCount.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg> Items in your cart (${totalItemCount})`;

    const labelEl = wrapper.querySelector('#summary-subtotal-label');
    const subtotalEl = wrapper.querySelector('#summary-subtotal');
    if(labelEl) labelEl.textContent = `Subtotal (${totalItemCount} items)`;
    if(subtotalEl) subtotalEl.textContent = `₹${subtotal}`;
    
    const discountRow = wrapper.querySelector('#summary-discount-row');
    const discountEl = wrapper.querySelector('#summary-discount');
    if (totalDiscount > 0 && discountRow && discountEl) {
        discountRow.style.display = 'flex';
        discountEl.textContent = `- ₹${totalDiscount}`;
    } else if (discountRow) {
        discountRow.style.display = 'none';
    }
    
    const shippingEl = wrapper.querySelector('#summary-shipping');
    if(shippingEl) {
        shippingEl.textContent = shippingCost === 0 ? (subtotal === 0 ? '₹0' : 'FREE') : `₹${shippingCost}`;
        shippingEl.style.color = shippingCost === 0 && subtotal > 0 ? '#10b981' : 'inherit';
    }
    
    const totalEl = wrapper.querySelector('#summary-total');
    if(totalEl) totalEl.textContent = `₹${finalTotal}`;

    const savingsCell = wrapper.querySelector('#savings-trust-cell');
    const savingsText = wrapper.querySelector('#savings-text');
    if (totalDiscount > 0 && savingsCell && savingsText) {
        savingsCell.style.display = 'flex';
        savingsText.textContent = `You're saving ₹${totalDiscount}!`;
    } else if (savingsCell) {
        savingsCell.style.display = 'none';
    }

    const progressBlock = wrapper.querySelector('#delivery-progress-block');
    if (progressBlock) {
        if (subtotal === 0) {
            progressBlock.style.display = 'none';
        } else {
            progressBlock.style.display = 'flex';
            const progressFill = wrapper.querySelector('#delivery-progress-fill');
            const progressText = wrapper.querySelector('#delivery-progress-text');
            const ratioText = wrapper.querySelector('#delivery-ratio-text');
            
            if (subtotal >= FREE_SHIPPING_THRESHOLD) {
                if(progressFill) { progressFill.style.width = '100%'; progressFill.style.backgroundColor = '#10b981'; }
                if(progressText) progressText.textContent = "You've unlocked FREE delivery!";
                if(ratioText) ratioText.textContent = `₹${subtotal} / ₹${FREE_SHIPPING_THRESHOLD}`;
            } else {
                const percentage = Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100);
                const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
                if(progressFill) { progressFill.style.width = `${percentage}%`; progressFill.style.backgroundColor = '#1B5E20'; }
                if(progressText) progressText.textContent = `Add ₹${remaining} more for FREE delivery!`;
                if(ratioText) ratioText.textContent = `₹${subtotal} / ₹${FREE_SHIPPING_THRESHOLD}`;
            }
        }
    }
};

window.forceCartRender = async function() {
    const containers = document.querySelectorAll('.cart-page-wrapper #cart-items-container');
    containers.forEach(async (container) => {
        await window.loadCartData(container);
    });
};

window.initCart = async function() {
    const containers = document.querySelectorAll('.cart-page-wrapper #cart-items-container:not([data-rendered="true"])');
    containers.forEach(async (container) => {
        container.setAttribute('data-rendered', 'true');
        await window.loadCartData(container);
    });
};


// --- 2. EXECUTION & OBSERVERS (Safely at the bottom) ---
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", window.initCart);
} else {
    window.initCart();
}

if (!window.cartObserver) {
    window.cartObserver = new MutationObserver(window.initCart);
    window.cartObserver.observe(document.body, { childList: true, subtree: true });
}

// --- 3. EVENT DELEGATION LOGIC ---
if (!window.cartEventsInitialized) {
    document.addEventListener('click', async (e) => {
        let cart = JSON.parse(localStorage.getItem('user_cart')) || [];
        let updated = false;

        if (e.target.closest('.qty-minus')) {
            e.preventDefault();
            const btn = e.target.closest('.qty-minus');
            const id = btn.getAttribute('data-id');
            const index = cart.findIndex(i => String(i.variant_id) === String(id));
            if (index > -1 && cart[index].quantity > 1) {
                cart[index].quantity -= 1;
                updated = true;
            }
        }
        else if (e.target.closest('.qty-plus')) {
            e.preventDefault();
            const btn = e.target.closest('.qty-plus');
            const id = btn.getAttribute('data-id');
            const maxStock = parseInt(btn.getAttribute('data-stock') || 99);
            const index = cart.findIndex(i => String(i.variant_id) === String(id));
            if (index > -1 && cart[index].quantity < maxStock) {
                cart[index].quantity += 1;
                updated = true;
            }
        }
        else if (e.target.closest('.remove-item')) {
            e.preventDefault();
            const btn = e.target.closest('.remove-item');
            const id = btn.getAttribute('data-id');
            cart = cart.filter(i => String(i.variant_id) !== String(id));
            updated = true;
        }
        else if (e.target.closest('#clear-cart-desk') || e.target.closest('#clear-cart-mob')) {
            e.preventDefault();
            if(cart.length > 0 && confirm("Are you sure you want to empty your cart?")) {
                cart = [];
                updated = true;
            }
        }
        
        else if (e.target.closest('#btn-checkout')) {
                    e.preventDefault();
                    let currentCart = JSON.parse(localStorage.getItem('user_cart')) || [];
                    
                    sessionStorage.setItem('checkout_payload', JSON.stringify(currentCart));
                    
                    // ADD THIS LINE: Tell checkout this came from the cart
                    sessionStorage.setItem('checkout_mode', 'cart');
                    
                    window.location.href = '/pages/checkout.html';
        }
        if (updated) {
            localStorage.setItem('user_cart', JSON.stringify(cart));
            await window.forceCartRender(); 
        }
    });
    
    window.cartEventsInitialized = true;
}