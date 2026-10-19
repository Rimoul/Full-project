// ==========================================================================
// ORDER DETAILS LOGIC - SEAZONAL SWAAD
// ==========================================================================

// We use an immediate async function instead of DOMContentLoaded 
// so it executes perfectly even when injected by your custom SPA router.
async function initOrderDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');
    const mainContainer = document.getElementById('order-details-main-container');
    const loadingState = document.getElementById('od-loading-state');

    // SPA Router Safety: If elements aren't in the DOM yet, wait 50ms and try again
    if (!mainContainer || !loadingState) {
        setTimeout(initOrderDetails, 50);
        return;
    }

    if (!orderId) {
        showErrorState(loadingState, "Invalid Request", "No order ID was provided in the URL.");
        return;
    }

    try {
        // 1. SECURE FETCH (Check this path matches your folder structure!)
        const response = await fetch('/tables4.json');
        
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: Make sure the path '/tables4.json' is correct.`);
        }

        const data = await response.json();

        if (!data || !data.orders) {
            throw new Error("Invalid JSON structure: The 'orders' array is missing.");
        }

        // 2. VERIFY ORDER & AUTHORIZATION
        const order = data.orders.find(o => o.order_id === orderId);

        // If the fetch worked but the order doesn't exist (or belongs to someone else)
        if (!order || order.user_id !== 'U1001') {
            showErrorState(loadingState, "Access Denied", "This order does not exist or you do not have permission to view it.");
            return;
        }

        // 3. EXTRACT ASSOCIATED DATA safely
        const items = data.order_items ? data.order_items.filter(i => i.order_id === orderId) : [];
        const payment = data.payments ? data.payments.find(p => p.order_id === orderId) : null;

        // 4. RENDER UI
        renderHeader(order);
        renderAddress(order);
        renderPayment(payment || {}); // Pass empty object if no payment found
        renderItems(items);
        renderPriceBreakdown(order);
        renderSidebar(order, items[0]);

        // Reveal the page
        loadingState.style.display = 'none';
        mainContainer.style.display = 'flex';

    } catch (error) {
        console.error("Order Details Crash:", error);
        // This will print the exact JavaScript failure directly to your screen
        showErrorState(loadingState, "System Error", `Crash Reason: ${error.message}`);
    }
}

// --------------------------------------------------------------------------
// RENDER FUNCTIONS
// --------------------------------------------------------------------------

function renderHeader(order) {
    const dateObj = new Date(order.placed_at);
    const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    document.getElementById('od-order-number').textContent = `Order #${order.order_number}`;
    document.getElementById('od-order-date').textContent = `Placed on ${formattedDate}, ${formattedTime}`;

    const statusMap = {
        'Placed': { text: 'Order Placed', class: 'badge-blue', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' },
        'Packed': { text: 'Packed', class: 'badge-blue', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>' },
        'Shipped': { text: 'Shipped', class: 'badge-blue', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>' },
        'Out_For_Delivery': { text: 'Out for Delivery', class: 'badge-green', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>' },
        'Delivered': { text: 'Delivered', class: 'badge-green', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' },
        'Cancelled': { text: 'Cancelled', class: 'badge-red', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>' }
    };

    const statusConfig = statusMap[order.current_status] || statusMap['Placed'];
    
    document.getElementById('od-status-badge-container').innerHTML = `
        <span class="status-badge ${statusConfig.class}">
            ${statusConfig.icon} ${statusConfig.text}
        </span>
    `;

    const alertBox = document.getElementById('od-status-alert');
    if (order.current_status === 'Out_For_Delivery' || order.current_status === 'Cancelled') {
        alertBox.style.display = 'flex';
        if (order.current_status === 'Out_For_Delivery') {
            alertBox.style.backgroundColor = '#f0fdf4'; 
            alertBox.innerHTML = `
                <div class="alert-icon" style="color:#15803d;"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div>
                <div class="alert-content">
                    <h4 style="color:#15803d;">Delivery Update</h4>
                    <h3 style="color:#166534;">Your order is out for delivery!</h3>
                    <p style="color:#15803d;">Expected to reach you today. Have a sweet day!</p>
                </div>
            `;
        } else {
            alertBox.style.backgroundColor = '#fef2f2'; 
            alertBox.innerHTML = `
                <div class="alert-icon" style="color:#b91c1c;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg></div>
                <div class="alert-content">
                    <h4 style="color:#b91c1c;">Order Cancelled</h4>
                    <h3 style="color:#991b1b;">This order has been cancelled.</h3>
                    <p style="color:#b91c1c;">If a payment was made, refunds are processed within 3-5 business days.</p>
                </div>
            `;
        }
    }
}

function renderAddress(order) {
    // Safely checks if optional fields like landmark exist before rendering them
    const landmarkHTML = order.shipping_landmark ? `${order.shipping_landmark}<br>` : '';
    
    document.getElementById('od-shipping-address').innerHTML = `
        <h4 class="name" style="margin-top:1rem; font-size:1.1rem; color:#374151;">${order.shipping_name || 'N/A'}</h4>
        <p class="address-text" style="color:#4b5563; line-height:1.6; margin:0.5rem 0;">
            ${order.shipping_address_line || 'Address missing'}<br>
            ${landmarkHTML}
            ${order.shipping_city || ''}, ${order.shipping_state || ''} - ${order.shipping_pin_code || ''}<br>
            ${order.shipping_country || ''}
        </p>
        <p class="phone-text" style="color:#4b5563; font-weight:500; display:flex; align-items:center; gap:0.5rem; margin-top:1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> 
            ${order.shipping_phone || 'N/A'}
        </p>
    `;
}

function renderPayment(payment) {
    const method = payment.payment_method || 'Cash on Delivery';
    const transId = payment.transaction_id || 'N/A';
    const status = payment.payment_status || 'Pending';
    
    let pDate = '---';
    if (payment.paid_at) {
        const d = new Date(payment.paid_at);
        pDate = `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }

    const isPaid = status.toLowerCase() === 'paid';
    const statusIcon = isPaid ? '<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px; margin-right:4px; vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : '';
    const statusClass = isPaid ? 'text-green' : 'text-orange';

    document.getElementById('od-payment-details').innerHTML = `
        <li><span>Payment Method</span> <strong>${method}</strong></li>
        <li><span>Payment Status</span> <strong class="${statusClass}" style="display:flex; align-items:center;">${statusIcon} ${status}</strong></li>
        <li><span>Transaction ID</span> <strong>${transId}</strong></li>
        <li><span>Timestamp</span> <strong>${pDate}</strong></li>
    `;
}

function renderItems(items) {
    if (items.length === 0) return;

    document.getElementById('od-items-count-title').innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#C20A35" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> 
        Order Items (${items.length})
    `;

    document.getElementById('od-order-items-list').innerHTML = items.map(item => `
        <div class="item-row" style="display:flex; gap:1.5rem; padding:1.5rem 0; border-bottom:1px solid #f3f4f6;">
            <img src="${item.snapshot_image || '/media/placeholder.png'}" alt="${item.snapshot_name || 'Product'}" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid #e5e7eb; background:#f9fafb;">
            <div class="item-details" style="flex:1;">
                <div class="title-bar" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.25rem;">
                    <h4 style="color:#111827; font-size:1.1rem; margin:0;">${item.snapshot_name || 'Unknown Item'}</h4>
                    <strong style="color:#111827;">₹${item.line_total || 0}</strong>
                </div>
                <div style="display:flex; gap:1rem; color:#6b7280; font-size:0.9rem; margin-bottom:0.5rem;">
                    <span class="weight">Weight: ${item.snapshot_weight || 'N/A'}</span>
                    <span>Qty: ${item.quantity || 1}</span>
                </div>
                <span class="tag tag-traditional" style="display:inline-block; font-size:0.75rem; padding:0.25rem 0.5rem; background:#fef3c7; color:#b45309; border-radius:4px; font-weight:600;">${item.snapshot_category || 'Sweets'}</span>
            </div>
        </div>
    `).join('');
}

function renderPriceBreakdown(order) {
    document.getElementById('od-price-breakdown').innerHTML = `
        <div class="price-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; color:#4b5563;">
            <span>Subtotal</span> <strong>₹${order.subtotal || 0}</strong>
        </div>
        ${order.discount_applied > 0 ? `
        <div class="price-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; color:#4b5563;">
            <span>Discount</span> <strong style="color:#15803d;">- ₹${order.discount_applied}</strong>
        </div>` : ''}
        <div class="price-row" style="display:flex; justify-content:space-between; margin-bottom:1rem; color:#4b5563;">
            <span>Delivery Charge</span> <strong>₹${order.delivery_charge || 0}</strong>
        </div>
    `;

    document.getElementById('od-price-total').innerHTML = `
        <span style="font-size:1.1rem; color:#374151;">Total Amount</span>
        <strong style="font-size:1.5rem; color:#8C2B22;">₹${order.total_amount || 0}</strong>
    `;
}

function renderSidebar(order, firstItem) {
    // Safely handle missing item data to prevent UI crashes
    const imgUrl = firstItem?.snapshot_image || '/media/placeholder.png';
    const itemName = firstItem?.snapshot_name || 'Your Items';
    const weight = firstItem?.snapshot_weight || '';

    document.getElementById('od-sidebar-snapshot').innerHTML = `
        <img src="${imgUrl}" alt="${itemName}" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid #e5e7eb;">
        <div class="snapshot-info" style="flex:1;">
            <h4 style="margin:0 0 0.25rem 0; font-size:0.95rem; color:#111827;">${itemName}</h4>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="weight" style="color:#6b7280; font-size:0.85rem;">${weight}</span>
                <strong class="price" style="color:#8C2B22; font-size:0.95rem;">₹${order.total_amount || 0}</strong>
            </div>
        </div>
    `;

    const actionsContainer = document.getElementById('od-sidebar-actions');
    let actionsHTML = '';

    if (order.current_status !== 'Cancelled') {
        actionsHTML += `
            <a href="/pages/track-order.html?id=${order.order_id}" class="btn-action btn-filled" style="display:flex; width:100%; justify-content:center; align-items:center; gap:0.5rem; margin-bottom:1rem; text-decoration:none;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> Track Order
            </a>
        `;
    }

    const canCancel = order.current_status === 'Placed' || order.current_status === 'Packed';
    actionsHTML += `
        <div class="action-group" style="margin-bottom:1rem;">
            <button class="btn-action btn-outline-danger ${canCancel ? '' : 'disabled'}" ${canCancel ? '' : 'disabled'} style="display:flex; width:100%; justify-content:center; align-items:center; gap:0.5rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Cancel Order
            </button>
            <p class="helper-text" style="font-size:0.75rem; color:#6b7280; text-align:center; margin-top:0.25rem;">${canCancel ? 'Available until the order is shipped.' : 'Cancellation period has passed.'}</p>
        </div>
    `;

    const canReturn = order.current_status === 'Delivered';
    actionsHTML += `
        <div class="action-group" style="margin-bottom:1rem;">
            <button class="btn-action btn-outline ${canReturn ? '' : 'disabled'}" ${canReturn ? '' : 'disabled'} style="display:flex; width:100%; justify-content:center; align-items:center; gap:0.5rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg> Return / Refund
            </button>
            <p class="helper-text" style="font-size:0.75rem; color:#6b7280; text-align:center; margin-top:0.25rem;">${canReturn ? 'You have 7 days to initiate a return.' : 'Available after delivery.'}</p>
        </div>
    `;

    actionsHTML += `
        <button class="btn-action btn-outline" style="display:flex; width:100%; justify-content:center; align-items:center; gap:0.5rem; margin-bottom:1rem;" onclick="window.print()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Download Invoice
        </button>
        <a href="/pages/support.html" class="btn-action btn-outline" style="display:flex; width:100%; justify-content:center; align-items:center; gap:0.5rem; text-decoration:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg> Need Help?
        </a>
    `;

    actionsContainer.innerHTML = actionsHTML;
}

function showErrorState(loadingElement, title, message) {
    loadingElement.style.display = 'block';
    loadingElement.innerHTML = `
        <div style="padding: 4rem 1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="1.5" style="width:64px; height:64px; margin-bottom:1.5rem;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <h2 style="font-size: 1.5rem; color: #374151; margin-bottom: 1rem;">${title}</h2>
            <p style="color: #6b7280; margin-bottom: 2rem; max-width: 500px; margin-left: auto; margin-right: auto;">${message}</p>
            <a href="/pages/orders.html" class="btn-filled" style="display: inline-block; padding: 1rem 2rem; text-decoration: none;">Return to My Orders</a>
        </div>
    `;
}

// Global click listener for the Copy ID button
document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-copy-id')) {
        const urlParams = new URLSearchParams(window.location.search);
        navigator.clipboard.writeText(urlParams.get('id')).then(() => {
            const btn = document.getElementById('btn-copy-id');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2" style="width:16px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => btn.innerHTML = originalHtml, 2000);
        });
    }
});

// Run Initialization Immediately
initOrderDetails();