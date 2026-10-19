// 1. GLOBAL STATE
let catalogProducts = [];
let catalogMedia = [];
let catalogVariants = [];
let catalogCategories = [];
let catalogProductCategories = [];
let currentCategory = 'All Products';
let currentSort = 'featured';

// --- SPA LIFECYCLE MANAGEMENT ---
function initCatalog() {
    const grid = document.getElementById('product-grid');
    if (grid && !grid.hasAttribute('data-rendered')) {
        grid.setAttribute('data-rendered', 'true');
        if (catalogProducts.length === 0) {
            fetchCatalog();
        } else {
            renderGrid();
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initCatalog);
} else {
    initCatalog();
}

const observer = new MutationObserver(initCatalog);
observer.observe(document.body, { childList: true, subtree: true });

// --- 2. FETCH NEW SCHEMA DATA ---
async function fetchCatalog() {
    try {
        // Fetching from your new file
        const response = await fetch('/tables4.json'); 
        if (!response.ok) throw new Error("Could not find tables4.json");
        
        const db = await response.json();
        
        // Map the new enterprise tables
        catalogProducts = db.products || [];
        catalogMedia = db.product_media || [];
        catalogVariants = db.product_variants || [];
        catalogCategories = db.categories || [];
        catalogProductCategories = db.product_categories || [];
        
        renderGrid(); 
    } catch (error) {
        console.error("Error loading products:", error);
        const grid = document.getElementById('product-grid');
        if(grid) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; min-height: 200px; color: #ef4444; font-size: 1.1rem;">Failed to load the catalog.</div>`;
        }
    }
}

// --- 3. FILTER, SORT, AND RENDER ---
function renderGrid() {
    const grid = document.getElementById('product-grid');
    if (!grid) return; 

    grid.innerHTML = ''; 
    let cart = [];
    let wishlist = [];
    
    try {
        cart = JSON.parse(localStorage.getItem('user_cart')) || [];
        wishlist = JSON.parse(localStorage.getItem('user_wishlist')) || [];
    } catch(e) {}

    // Find the category ID for the currently selected pill
    // Smart Filter: Strip trailing 's' to match "Sweets" (button) with "Sweet" (database)
    const searchPill = currentCategory.toLowerCase().replace(/s$/, '');
    const targetCategoryObj = catalogCategories.find(c => c.name.toLowerCase().replace(/s$/, '') === searchPill);
    
    // Relational Filtering
    let filteredProducts = catalogProducts.filter(product => {
        if (product.is_active === false || product.deleted_at !== null) return false;
        if (currentCategory === 'All Products') return true;
        if (!targetCategoryObj) return false;

        // Check the junction table to see if this product belongs to the selected category
        return catalogProductCategories.some(pc => pc.product_id === product.product_id && pc.category_id === targetCategoryObj.category_id);
    });

    // Relational Sorting (Requires mapping to the default variant's price)
    if (currentSort === 'price-low' || currentSort === 'price-high') {
        filteredProducts.sort((a, b) => {
            const variantA = catalogVariants.find(v => v.product_id === a.product_id) || { selling_price: 0 };
            const variantB = catalogVariants.find(v => v.product_id === b.product_id) || { selling_price: 0 };
            return currentSort === 'price-low' 
                ? parseFloat(variantA.selling_price) - parseFloat(variantB.selling_price)
                : parseFloat(variantB.selling_price) - parseFloat(variantA.selling_price);
        });
    }

    if (filteredProducts.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; min-height: 200px; color: #9ca3af; font-size: 1.1rem;">There are no products available in this category.</div>`;
        return;
    }

    // Build Cards
    filteredProducts.forEach(product => {
        // 1. Get Primary Media
        const primaryImage = catalogMedia.find(m => m.product_id === product.product_id && m.is_primary === true);
        const imgUrl = primaryImage ? primaryImage.media_url : '/media/placeholder.png';

        // 2. Get Default Variant (to show price and weight on the card)
        const defaultVariant = catalogVariants.find(v => v.product_id === product.product_id && v.is_active !== false);
        if (!defaultVariant) return; // Skip products with no active variants

        // 3. Get the first assigned category name for the card badge
        const firstCatLink = catalogProductCategories.find(pc => pc.product_id === product.product_id);
        const firstCatObj = firstCatLink ? catalogCategories.find(c => c.category_id === firstCatLink.category_id) : null;
        const badgeName = firstCatObj ? firstCatObj.name : 'Sweet';

        // 4. Check Cart (Now tied to Variant ID, not Product ID)
        const cartItem = cart.find(item => item.variant_id === defaultVariant.variant_id);
        const qtyInCart = cartItem ? cartItem.quantity : 0;

        // 5. Check Wishlist (Still tied to Product ID)
        const isWishlisted = wishlist.includes(product.product_id);
        const heartFill = isWishlisted ? '#ef4444' : 'none'; 
        const heartStroke = isWishlisted ? '#ef4444' : 'currentColor';
        const heartClass = isWishlisted ? 'wishlist-btn active-heart' : 'wishlist-btn';

        let actionsHTML = '';
        if (qtyInCart > 0) {
            actionsHTML = `
                <div class="add-to-cart-btn" style="display: inline-flex; justify-content: space-between; align-items: center; padding: 0; min-width: 140px; cursor: default;">
                    <button class="btn-qty" onclick="updateQuantity(event, '${defaultVariant.variant_id}', -1, ${defaultVariant.stock_quantity})" style="background: transparent; border: none; color: inherit; font-size: 1.5rem; cursor: pointer; padding: 0.5rem 1rem; line-height: 1;">−</button>
                    <span style="font-weight: 600; font-size: 1.1rem; color: inherit;">${qtyInCart}</span>
                    <button class="btn-qty" onclick="updateQuantity(event, '${defaultVariant.variant_id}', 1, ${defaultVariant.stock_quantity})" style="background: transparent; border: none; color: inherit; font-size: 1.3rem; cursor: pointer; padding: 0.5rem 1rem; line-height: 1;">+</button>
                </div>
            `;
        } else {
            actionsHTML = `
                <button class="add-to-cart-btn" onclick="addToCart(event, '${defaultVariant.variant_id}', ${defaultVariant.stock_quantity})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    Add to Cart
                </button>
            `;
        }

        const cardHTML = `
            <div class="product-card" onclick="goToProduct('${product.product_id}')" style="cursor: pointer;">
                <div class="product-image-container">
                    <img src="${imgUrl}" alt="${product.name}" class="product-img" style="background-color: #E5D9C5;">
                    <span class="category-badge badge-traditional">${badgeName}</span>
                    
                    <button class="${heartClass}" aria-label="Add to wishlist" onclick="toggleWishlist(event, '${product.product_id}')">
                        <svg viewBox="0 0 24 24" fill="${heartFill}" stroke="${heartStroke}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </button>
                </div>
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <p class="product-desc">${product.short_description}</p> 
                    <div class="product-price-row">
                        <span class="price">₹ ${defaultVariant.selling_price}</span>
                        <span class="divider">|</span>
                        <span class="weight">${defaultVariant.weight_value} ${defaultVariant.weight_unit}</span>
                    </div>
                    <div class="product-actions">
                        ${actionsHTML}
                    </div>
                </div>
            </div>
        `;
        grid.innerHTML += cardHTML;
    });
}

// --- 4. EVENT DELEGATION & INTERACTIONS ---
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-pill')) {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        currentCategory = e.target.textContent.trim();
        renderGrid();
    }
});

document.addEventListener('change', (e) => {
    if (e.target.classList.contains('sort-dropdown')) {
        currentSort = e.target.value;
        renderGrid();
    }
});

function goToProduct(productId) {
    window.location.href = `/pages/product.html?id=${productId}`;
}

// Cart functions now accept variantId
function addToCart(event, variantId, stockLimit) {
    event.stopPropagation(); 
    if (stockLimit < 1) return alert("Sorry, this item is out of stock.");

    let cart = JSON.parse(localStorage.getItem('user_cart')) || [];
    cart.push({ variant_id: variantId, quantity: 1 });
    localStorage.setItem('user_cart', JSON.stringify(cart));
    renderGrid(); 
}

function updateQuantity(event, variantId, change, stockLimit) {
    event.stopPropagation();
    let cart = JSON.parse(localStorage.getItem('user_cart')) || [];
    
    const itemIndex = cart.findIndex(i => i.variant_id === variantId);
    if (itemIndex > -1) {
        let newQty = cart[itemIndex].quantity + change;
        if (newQty > stockLimit) return alert("Maximum available stock reached.");
        
        if (newQty <= 0) {
            cart.splice(itemIndex, 1);
        } else {
            cart[itemIndex].quantity = newQty;
        }
        localStorage.setItem('user_cart', JSON.stringify(cart));
        renderGrid(); 
    }
}

function toggleWishlist(event, productId) {
    event.stopPropagation();
    let wishlist = JSON.parse(localStorage.getItem('user_wishlist')) || [];
    
    if (wishlist.includes(productId)) {
        wishlist = wishlist.filter(id => id !== productId);
    } else {
        wishlist.push(productId);
    }
    localStorage.setItem('user_wishlist', JSON.stringify(wishlist));
    renderGrid(); 
}