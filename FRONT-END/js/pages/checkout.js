// --- 1. SPA-SAFE GLOBALS & INITIALIZER ---
window.initCheckout = async function() {
    const wrappers = document.querySelectorAll('.checkout-page-wrapper:not([data-rendered="true"])');
    wrappers.forEach(async (wrapper) => {
        wrapper.setAttribute('data-rendered', 'true');
        await window.loadCheckoutData(wrapper);
    });
};

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", window.initCheckout);
} else {
    window.initCheckout();
}

if (!window.chkObserver) {
    window.chkObserver = new MutationObserver(window.initCheckout);
    window.chkObserver.observe(document.body, { childList: true, subtree: true });
}

window.checkoutSelectedAddressId = null;

// --- 2. CORE FETCH & RENDER ---
window.loadCheckoutData = async function(wrapper) {
    try {
        let payload = JSON.parse(sessionStorage.getItem('checkout_payload'));
        if (!payload || payload.length === 0) {
            payload = JSON.parse(localStorage.getItem('user_cart')) || [];
        }

        if (payload.length === 0) {
            wrapper.innerHTML = `<div style="text-align:center; padding: 5rem;"><h2 style="color:#C20A35;">No items to checkout</h2><p>Please add items to your cart first.</p><a href="/pages/all-products.html" class="btn-checkout" style="display:inline-block; margin-top:2rem; width:auto; text-decoration:none;">Go to Shop</a></div>`;
            return;
        }

        const response = await fetch('/tables4.json');
        if (!response.ok) throw new Error("Failed to load DB");
        const db = await response.json();
        
        window.renderCheckoutAddresses(wrapper);
        window.renderCheckoutItems(db, wrapper, payload);
        window.updateCheckoutButtonState(wrapper);

    } catch (error) {
        console.error("Checkout Error:", error);
        wrapper.innerHTML = '<h3 style="text-align:center; padding:3rem;">Failed to load checkout details.</h3>';
    }
};

// --- 3. ADDRESS MANAGEMENT ---
window.renderCheckoutAddresses = function(wrapper) {
    const mainList = wrapper.querySelector('#checkout-address-list');
    const viewAllBtn = wrapper.querySelector('#btn-view-all-addresses');
    if (!mainList) return;

    let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
    let activeAddresses = addresses.filter(a => a.deleted_at === null);

    // Empty State
    if (activeAddresses.length === 0) {
        window.checkoutSelectedAddressId = null;
        mainList.innerHTML = `
            <div style="padding: 1.5rem; border: 1px dashed #C5A880; border-radius: 8px; text-align: center; background: #FFF9F0;">
                <p style="color: #6b7280; margin-bottom: 1rem;">You don't have any saved addresses yet.</p>
                <button class="btn-pay" id="btn-empty-add-address" style="width: auto; padding: 0.5rem 1.5rem;">+ Add Delivery Address</button>
            </div>
        `;
        if (viewAllBtn) viewAllBtn.style.display = 'none';
        window.updateCheckoutButtonState(wrapper);
        return;
    }

    // Determine Selected Address
    if (!window.checkoutSelectedAddressId || !activeAddresses.find(a => String(a.address_id) === String(window.checkoutSelectedAddressId))) {
        const defaultAddr = activeAddresses.find(a => a.is_default);
        window.checkoutSelectedAddressId = defaultAddr ? defaultAddr.address_id : activeAddresses[0].address_id;
    }

    // Grab ONLY the currently selected address for the main screen
    const selectedAddr = activeAddresses.find(a => String(a.address_id) === String(window.checkoutSelectedAddressId));

    // Render Main Screen (Shows exactly 1 address to keep it clean)
    mainList.innerHTML = `
        <label class="radio-card selected" style="margin-bottom:0.75rem; cursor:default;">
            <div class="custom-radio" style="background:#2E7D32; border-color:#2E7D32;"></div>
            <div class="card-content">
                <div class="card-title-row">
                    <h4 style="margin:0;">${selectedAddr.address_type} ${selectedAddr.label ? `(${selectedAddr.label})` : ''} ${selectedAddr.is_default ? '<span class="badge-default" style="background:#F59E0B; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-left:8px;">Default</span>' : ''}</h4>
                </div>
                <strong style="display:block; margin-top:0.5rem; color:#374151;">${selectedAddr.recipient_name}</strong>
                <p style="margin: 0.25rem 0;">${selectedAddr.address_line}, ${selectedAddr.landmark ? selectedAddr.landmark + ',' : ''} ${selectedAddr.city}, ${selectedAddr.state} - ${selectedAddr.pin_code}</p>
                <p class="phone" style="font-weight:600; margin-top:0.5rem;">${selectedAddr.phone_number}</p>
            </div>
            <button class="btn-edit checkout-edit-addr-btn" data-id="${selectedAddr.address_id}" type="button" style="z-index: 10; position:relative;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button>
        </label>
    `;

    // Toggle "View All" Button: Show it inline-flex if there's more than 1 address!
    if (viewAllBtn) {
        viewAllBtn.style.display = activeAddresses.length > 1 ? 'inline-flex' : 'none';
    }

    window.renderModalAddresses(activeAddresses, '');
    window.updateCheckoutButtonState(wrapper);
};

window.renderModalAddresses = function(activeAddresses, searchTerm) {
    const modalList = document.querySelector('#modal-address-list');
    if (!modalList) return;

    const filtered = activeAddresses.filter(addr => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (addr.recipient_name && addr.recipient_name.toLowerCase().includes(term)) ||
               (addr.city && addr.city.toLowerCase().includes(term)) ||
               (addr.label && addr.label.toLowerCase().includes(term)) ||
               (addr.address_type && addr.address_type.toLowerCase().includes(term));
    });

    if (filtered.length === 0) {
        modalList.innerHTML = `<p style="text-align:center; color:#6b7280; padding: 2rem 0;">No addresses match your search.</p>`;
        return;
    }

    modalList.innerHTML = filtered.map(addr => `
        <label class="radio-card ${String(addr.address_id) === String(window.checkoutSelectedAddressId) ? 'selected' : ''}" style="margin-bottom:1rem;">
            <input type="radio" name="modal_addr_select" value="${addr.address_id}" ${String(addr.address_id) === String(window.checkoutSelectedAddressId) ? 'checked' : ''}>
            <div class="custom-radio"></div>
            <div class="card-content">
                <div class="card-title-row">
                    <h4 style="margin:0;">${addr.address_type} ${addr.label ? `(${addr.label})` : ''}</h4>
                </div>
                <strong style="display:block; margin-top:0.25rem; color:#374151;">${addr.recipient_name}</strong>
                <p style="margin: 0.25rem 0; font-size:0.9rem;">${addr.address_line}, ${addr.city} - ${addr.pin_code}</p>
            </div>
            <button class="btn-edit checkout-edit-addr-btn" data-id="${addr.address_id}" type="button" style="z-index: 10; position:relative;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button>
        </label>
    `).join('');
};

// --- 4. ITEM RENDERING & MATH ---
window.renderCheckoutItems = function(db, wrapper, payload) {
    const container = wrapper.querySelector('#checkout-items-container');
    if (!container) return;

    let subtotal = 0;
    let totalOriginal = 0;
    let totalItemCount = 0;
    let html = '';

    payload.forEach(item => {
        const variant = (db.product_variants || []).find(v => String(v.variant_id) === String(item.variant_id));
        if (!variant) return; 
        const product = (db.products || []).find(p => String(p.product_id) === String(variant.product_id));
        if (!product) return;
        
        const media = (db.product_media || []).find(m => String(m.product_id) === String(product.product_id) && m.is_primary) || (db.product_media || []).find(m => String(m.product_id) === String(product.product_id));
        const imgUrl = media ? media.media_url : '/media/placeholder.png';

        const qty = parseInt(item.quantity);
        const sellPrice = parseFloat(variant.selling_price);
        const origPrice = parseFloat(variant.original_price || variant.selling_price);
        
        subtotal += (sellPrice * qty);
        totalOriginal += (origPrice * qty);
        totalItemCount += qty;

        html += `
            <div class="checkout-item" style="display:flex; gap:1rem; padding-bottom:1rem; border-bottom:1px solid #e5e7eb; margin-bottom:1rem;">
                <img src="${imgUrl}" alt="${product.name}" style="width:70px; height:70px; object-fit:cover; border-radius:6px; background:#E5D9C5;">
                <div class="item-info" style="flex:1;">
                    <h4 style="margin:0 0 0.25rem 0; font-size:1rem; color:#3A100E;">${product.name}</h4>
                    <span style="display:block; font-size:0.85rem; color:#6b7280;">${variant.weight_value} ${variant.weight_unit}</span>
                    <span style="display:block; font-size:0.85rem; color:#6b7280;">Qty: ${qty}</span>
                </div>
                <strong class="item-price" style="color:#C20A35;">₹${sellPrice * qty}</strong>
            </div>
        `;
    });

    container.innerHTML = html;

    const header = wrapper.querySelector('#checkout-items-header');
    if (header) header.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#C20A35" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg> Order Items (${totalItemCount})`;

    const FREE_SHIPPING_THRESHOLD = 499;
    const SHIPPING_FEE = 49;
    const totalDiscount = totalOriginal - subtotal;
    const requiresShipping = (subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD);
    const shippingCost = requiresShipping ? SHIPPING_FEE : 0;
    const finalTotal = subtotal + shippingCost;

    wrapper.querySelector('#checkout-subtotal-label').textContent = `Item Total (${totalItemCount} items)`;
    wrapper.querySelector('#checkout-item-total').textContent = `₹${subtotal}`;
    
    const discRow = wrapper.querySelector('#checkout-discount-row');
    if(totalDiscount > 0 && discRow) {
        discRow.style.display = 'flex';
        wrapper.querySelector('#checkout-discount').textContent = `- ₹${totalDiscount}`;
    } else if (discRow) {
        discRow.style.display = 'none';
    }
    
    wrapper.querySelector('#checkout-delivery').textContent = shippingCost === 0 ? 'FREE' : `₹${shippingCost}`;
    wrapper.querySelector('#checkout-delivery').style.color = shippingCost === 0 ? '#10b981' : 'inherit';
    wrapper.querySelector('#checkout-final-total').textContent = `₹${finalTotal}`;
    
    const payBtn = wrapper.querySelector('#btn-pay-now');
    if(payBtn) payBtn.setAttribute('data-amount', finalTotal);
};

window.updateCheckoutButtonState = function(wrapper) {
    const terms = wrapper.querySelector('#terms-checkbox');
    const payBtn = wrapper.querySelector('#btn-pay-now');
    const hasAddress = window.checkoutSelectedAddressId !== null;
    
    // Check which payment method is currently selected
    const paymentInput = document.querySelector('input[name="payment_method"]:checked');
    const paymentMethod = paymentInput ? paymentInput.value : null;

    if (!terms || !payBtn) return;

    // Grab the final amount dynamically
    const amount = payBtn.getAttribute('data-amount') || 0;
    
    // If the button is currently showing the "Processing..." spinner, don't overwrite it
    if (payBtn.innerHTML.includes('Processing')) return;

    // Logic: If any requirement is missing, keep it simple and disabled
    if (!terms.checked || !hasAddress || !paymentMethod) {
        payBtn.innerHTML = 'Place Order';
        payBtn.classList.add('btn-disabled');
        payBtn.disabled = true;
        payBtn.style.cursor = 'not-allowed';
        payBtn.style.background = '#d1d5db';
        payBtn.style.color = '#4b5563';
    } 
    // Logic: All requirements met! Make it colorful and dynamic
    else {
        if (paymentMethod === 'cod') {
            payBtn.innerHTML = `Place Order ₹${amount} &rarr;`;
        } else {
            // Digital Payments get the Secure Lock icon
            payBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; height:18px; margin-top:-2px; margin-right:6px; display:inline-block; vertical-align:middle;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Pay ₹${amount} &rarr;`;
        }
        
        payBtn.classList.remove('btn-disabled');
        payBtn.disabled = false;
        payBtn.style.cursor = 'pointer';
        payBtn.style.opacity = '1';
        payBtn.style.background = '#D85203'; 
        payBtn.style.color = '#ffffff';
    }
};

// --- 5. EVENT DELEGATION (Interactions) ---
if (!window.chkEventsInitialized) {

    // SEARCH INPUT LISTENER
    document.addEventListener('input', (e) => {
        if (e.target.id === 'address-search-input') {
            let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
            let activeAddresses = addresses.filter(a => a.deleted_at === null);
            window.renderModalAddresses(activeAddresses, e.target.value);
        }
    });

    document.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.checkout-page-wrapper');
        const selectorModal = document.getElementById('checkoutAddressSelectorModal');
        const formModal = document.getElementById('checkoutAddressFormModal');
        const form = document.getElementById('checkoutAddressForm');

        // OPEN SELECTOR MODAL
        if (e.target.closest('#btn-view-all-addresses')) {
            e.preventDefault();
            if(selectorModal) {
                document.getElementById('address-search-input').value = ''; // Reset search
                let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
                window.renderModalAddresses(addresses.filter(a => a.deleted_at === null), '');
                selectorModal.classList.add('active');
            }
        }

        // OPEN FORM MODAL (Add New)
        else if (e.target.closest('#btn-add-new-address') || e.target.closest('#btn-empty-add-address')) {
            e.preventDefault();
            if(formModal && form) {
                form.reset();
                form.removeAttribute('data-edit-id');
                document.getElementById('checkout-form-title').textContent = 'Add New Address';
                
                // Reset Custom Premium UI Radio Boxes
                document.getElementById('chk-addr-type').value = 'Home';
                document.querySelectorAll('.radio-box').forEach(b => b.classList.remove('active'));
                const homeBox = document.querySelector('.radio-box input[value="Home"]');
                if(homeBox) homeBox.closest('.radio-box').classList.add('active');

                formModal.classList.add('active');
            }
        }

        // OPEN FORM MODAL (Edit Address)
        else if (e.target.closest('.checkout-edit-addr-btn')) {
            e.preventDefault();
            e.stopPropagation(); // Stop the radio button from clicking
            const btn = e.target.closest('.checkout-edit-addr-btn');
            const id = btn.getAttribute('data-id');
            let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
            const addr = addresses.find(a => String(a.address_id) === String(id));
            
            if(addr && formModal && form) {
                form.setAttribute('data-edit-id', id);
                document.getElementById('checkout-form-title').textContent = 'Edit Address';
                
                // Set Custom Premium UI Radio Boxes
                const type = addr.address_type || 'Home';
                document.getElementById('chk-addr-type').value = type;
                document.querySelectorAll('.radio-box').forEach(b => b.classList.remove('active'));
                const typeBox = document.querySelector(`.radio-box input[value="${type}"]`);
                if(typeBox) typeBox.closest('.radio-box').classList.add('active');

                // Populate Form Fields
                document.getElementById('chk-addr-label').value = addr.label || '';
                document.getElementById('chk-addr-name').value = addr.recipient_name || '';
                document.getElementById('chk-addr-phone').value = addr.phone_number || '';
                document.getElementById('chk-addr-line').value = addr.address_line || '';
                document.getElementById('chk-addr-landmark').value = addr.landmark || '';
                document.getElementById('chk-addr-city').value = addr.city || '';
                document.getElementById('chk-addr-state').value = addr.state || '';
                document.getElementById('chk-addr-pin').value = addr.pin_code || '';
                
                if(selectorModal) selectorModal.classList.remove('active'); // Close selector if open
                formModal.classList.add('active');
            }
        }

        // CLOSE MODALS
        else if (e.target.closest('#closeSelectorBtn')) {
            e.preventDefault();
            if(selectorModal) selectorModal.classList.remove('active');
        }
        else if (e.target.closest('#closeFormBtn') || e.target.closest('#cancelFormBtn')) {
            e.preventDefault();
            if(formModal) formModal.classList.remove('active');
        }

        // SELECT ADDRESS (Main Screen or Modal)
        const mainRadio = e.target.closest('#checkout-address-list .radio-card');
        const modalRadio = e.target.closest('#modal-address-list .radio-card');
        
        if (mainRadio && !e.target.closest('.checkout-edit-addr-btn')) {
            const input = mainRadio.querySelector('input');
            if (input) window.checkoutSelectedAddressId = input.value;
            if (wrapper) window.renderCheckoutAddresses(wrapper);
        }
        else if (modalRadio && !e.target.closest('.checkout-edit-addr-btn')) {
            const input = modalRadio.querySelector('input');
            if (input) {
                window.checkoutSelectedAddressId = input.value;
                if(selectorModal) selectorModal.classList.remove('active');
                if(wrapper) window.renderCheckoutAddresses(wrapper);
            }
        }

        // SELECT PAYMENT METHOD UI
        const paymentRadio = e.target.closest('.payment-card');
        if (paymentRadio) {
            document.querySelectorAll('.payment-card').forEach(c => c.classList.remove('selected'));
            paymentRadio.classList.add('selected');
            const input = paymentRadio.querySelector('input');
            if (input) input.checked = true;

            if (wrapper) window.updateCheckoutButtonState(wrapper);
        }

        // TERMS CHECKBOX
        if (e.target.id === 'terms-checkbox') {
            if(wrapper) window.updateCheckoutButtonState(wrapper);
        }

        // PLACE ORDER (The Simulation)
        else if (e.target.id === 'btn-pay-now') {
            e.preventDefault();
            const btn = e.target;
            if (btn.disabled) return;

            // Feedback: Disable button and show spinner
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin" style="width:20px; animation: spin 1s linear infinite;"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg> Processing...`;
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'wait';

            const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;
            const finalAmount = parseFloat(btn.getAttribute('data-amount') || 0);
            
            let payload = JSON.parse(sessionStorage.getItem('checkout_payload'));
            const isDirectBuy = payload && payload.length > 0;
            if (!isDirectBuy) {
                payload = JSON.parse(localStorage.getItem('user_cart')) || [];
            }

            // Simulate 2-second gateway delay
            setTimeout(() => {
        const newOrderId = 'ORD' + Date.now();
        // ... (Keep your existing order creation code here) ...
        
        // TARGETED CLEANUP LOGIC
        const checkoutMode = sessionStorage.getItem('checkout_mode');
        
        // If they came from the cart, wipe the cart clean
        if (checkoutMode === 'cart') {
        localStorage.removeItem('user_cart');
        }
        
        // Always clean up the temporary session memory
        sessionStorage.removeItem('checkout_payload'); 
        sessionStorage.removeItem('checkout_mode');
        
        // Redirect to success/details
        window.location.href = `/pages/order-details.html?id=${newOrderId}`;
            }, 2000);
        }
    });

    // FORM SUBMISSION (Add/Edit Address)
    document.addEventListener('submit', (e) => {
        if (e.target.id === 'checkoutAddressForm') {
            e.preventDefault();
            const form = e.target;
            const editId = form.getAttribute('data-edit-id');
            let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
            const isFirst = addresses.filter(a => a.deleted_at === null).length === 0;

            const addressData = {
                user_id: 'U1001',
                address_type: document.getElementById('chk-addr-type').value,
                label: document.getElementById('chk-addr-label').value.trim() || null,
                recipient_name: document.getElementById('chk-addr-name').value.trim(),
                phone_number: document.getElementById('chk-addr-phone').value.trim(),
                address_line: document.getElementById('chk-addr-line').value.trim(),
                landmark: document.getElementById('chk-addr-landmark').value.trim() || null,
                city: document.getElementById('chk-addr-city').value.trim(),
                state: document.getElementById('chk-addr-state').value,
                pin_code: document.getElementById('chk-addr-pin').value.trim()
            };

            let targetId = editId;

            if (editId) {
                const idx = addresses.findIndex(a => String(a.address_id) === String(editId));
                if (idx > -1) {
                    addresses[idx] = { ...addresses[idx], ...addressData, updated_at: new Date().toISOString() };
                }
            } else {
                targetId = 'A' + Date.now();
                addresses.push({
                    ...addressData,
                    address_id: targetId,
                    is_default: isFirst,
                    created_at: new Date().toISOString(),
                    updated_at: null,
                    deleted_at: null
                });
            }

            localStorage.setItem('user_addresses', JSON.stringify(addresses));
            window.checkoutSelectedAddressId = targetId; // Auto-select the saved address
            
            const formModal = document.getElementById('checkoutAddressFormModal');
            if(formModal) formModal.classList.remove('active');
            
            const wrapper = document.querySelector('.checkout-page-wrapper');
            if(wrapper) window.renderCheckoutAddresses(wrapper);
        }
    });

    const style = document.createElement('style');
    style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);

    window.chkEventsInitialized = true;
}