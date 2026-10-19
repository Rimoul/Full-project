// ==========================================================================
// TRACK ORDER LOGIC - SEAZONAL SWAAD
// ==========================================================================

function bootstrapTrackOrderPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');
    const mainContainer = document.getElementById('track-order-main-container');
    const loadingState = document.getElementById('to-loading-state');

    // 1. SPA Router Safety: Wait for DOM elements to exist
    if (!mainContainer || !loadingState) {
        setTimeout(bootstrapTrackOrderPage, 50);
        return;
    }

    // Prevent duplicate execution if clicking back/forward quickly
    if (mainContainer.dataset.bootstrapped === 'true') return;
    mainContainer.dataset.bootstrapped = 'true';

    if (!orderId) {
        showErrorState(loadingState, "Invalid Request", "No order ID was provided in the URL.");
        return;
    }

    async function init() {
        try {
            // SECURE FETCH (Ensure path matches your environment, e.g., '/tables4.json' or '/data/tables4.json')
            const response = await fetch('/tables4.json'); 
            
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            const data = await response.json();

            // VERIFY ORDER
            const order = data.orders.find(o => o.order_id === orderId);
            if (!order || order.user_id !== 'U1001') {
                showErrorState(loadingState, "Access Denied", "This order does not exist or you do not have permission to view it.");
                return;
            }

            // EXTRACT ASSOCIATED DATA
            const items = data.order_items ? data.order_items.filter(i => i.order_id === orderId) : [];
            const trackingLogs = data.order_tracking ? data.order_tracking.filter(t => t.order_id === orderId) : [];

            // RENDER UI
            renderHeader(order);
            renderMainSnapshot(items[0]);
            renderVerticalTimeline(order, trackingLogs);
            renderSidebar(order, items[0]);

            // Reveal the page
            loadingState.style.display = 'none';
            mainContainer.style.display = 'flex';

        } catch (error) {
            console.error("Track Order Crash:", error);
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

        document.getElementById('to-order-id').innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="#8C2B22" stroke-width="2" style="width:24px; vertical-align:middle; margin-right:8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            Order #${order.order_number}
        `;
        document.getElementById('to-order-date').textContent = `Placed on ${formattedDate}, ${formattedTime}`;

        const statusMap = {
            'Placed': { text: 'Order Placed', class: 'badge-blue', icon: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>' },
            'Packed': { text: 'Packed', class: 'badge-blue', icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>' },
            'Shipped': { text: 'Shipped', class: 'badge-blue', icon: '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>' },
            'Out_For_Delivery': { text: 'Out for Delivery', class: 'badge-green', icon: '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>' },
            'Delivered': { text: 'Delivered', class: 'badge-green', icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' },
            'Cancelled': { text: 'Cancelled', class: 'badge-red', icon: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>' }
        };

        const statusConfig = statusMap[order.current_status] || statusMap['Placed'];
        document.getElementById('to-status-badge-container').innerHTML = `
            <span class="status-badge ${statusConfig.class}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${statusConfig.icon}</svg> 
                ${statusConfig.text}
            </span>
        `;
    }

    function renderMainSnapshot(item) {
        if (!item) return;
        document.getElementById('to-product-snapshot').innerHTML = `
            <img src="${item.snapshot_image || '/media/placeholder.png'}" alt="${item.snapshot_name}">
            <div class="snapshot-details">
                <div class="title-row" style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:0.5rem;">
                    <h3 style="margin:0; color:#111827; font-size:1.2rem;">${item.snapshot_name}</h3>
                    <span class="tag tag-traditional" style="font-size:0.75rem; padding:0.25rem 0.5rem; background:#fef3c7; color:#b45309; border-radius:4px; font-weight:600;">${item.snapshot_category || 'Sweets'}</span>
                </div>
                <div style="display:flex; gap:1.5rem; color:#4b5563;">
                    <span class="weight">${item.snapshot_weight}</span>
                    <span class="price" style="color:#8C2B22; font-weight:bold;">₹${item.line_total}</span>
                    <span>Qty: ${item.quantity}</span>
                </div>
            </div>
        `;
    }

    function renderVerticalTimeline(order, logs) {
        if (order.current_status === 'Cancelled') {
            document.getElementById('to-vertical-timeline').innerHTML = `
                <div style="padding: 2rem; text-align: center; color: #991b1b; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px; margin-bottom:1rem;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    <h3>Order Cancelled</h3>
                    <p style="margin-top:0.5rem;">Tracking is unavailable for cancelled orders.</p>
                </div>
            `;
            return;
        }

        // Define the master sequence
        const stepSequence = [
            { key: 'Placed', title: 'Order Placed', fallbackDesc: 'Your order has been placed successfully.' },
            { key: 'Packed', title: 'Packed', fallbackDesc: 'Your order has been packed and is ready for shipment.' },
            { key: 'Shipped', title: 'Shipped', fallbackDesc: 'Your order has been shipped from our store.' },
            { key: 'Out_For_Delivery', title: 'Out for Delivery', fallbackDesc: 'Your order is out for delivery and will reach you today.' },
            { key: 'Delivered', title: 'Delivered', fallbackDesc: 'Your order has been delivered successfully.' }
        ];

        // Determine current active level based on backend status
        const levels = { 'Placed': 0, 'Packed': 1, 'Shipped': 2, 'Out_For_Delivery': 3, 'Delivered': 4 };
        const currentLevel = levels[order.current_status] || 0;

        let timelineHTML = '';

        stepSequence.forEach((stepDef, index) => {
            // Check if the backend provided a specific log for this step
            const logEntry = logs.find(l => l.status_step === stepDef.key);
            
            let dateText = 'Pending';
            let descText = stepDef.fallbackDesc;
            
            if (logEntry) {
                const d = new Date(logEntry.logged_at);
                dateText = `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                descText = logEntry.description || descText;
            }

            // Determine styling classes
            let stepClass = 'pending';
            let iconHTML = '';
            let textClass = '';

            if (index < currentLevel || (index === currentLevel && order.current_status === 'Delivered')) {
                stepClass = 'completed';
                iconHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            } else if (index === currentLevel) {
                stepClass = 'current';
                textClass = 'text-green';
                iconHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"></circle></svg>`;
            }

            // Build individual step
            timelineHTML += `
                <div class="track-step ${stepClass}">
                    <div class="step-indicator">
                        <div class="step-icon">${iconHTML}</div>
                        ${index < stepSequence.length - 1 ? '<div class="step-line"></div>' : ''}
                    </div>
                    <div class="step-content">
                        <div class="step-main ${textClass}">
                            <h4 style="margin:0; font-size:1.05rem;">${stepDef.title}</h4>
                            <span class="step-date" style="font-size:0.85rem; color:#6b7280;">${dateText}</span>
                        </div>
                        <div class="step-desc ${textClass}" style="margin-top:0.25rem; font-size:0.9rem;">${descText}</div>
                    </div>
                </div>
            `;
        });

        document.getElementById('to-vertical-timeline').innerHTML = timelineHTML;

        // Populate Delivery Alert if applicable
        if (order.current_status !== 'Delivered' && order.expected_delivery) {
            const expDate = new Date(order.expected_delivery).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const alertBox = document.getElementById('to-delivery-alert');
            alertBox.style.display = 'flex';
            alertBox.innerHTML = `
                <div class="alert-icon" style="color:#15803d; margin-right:1rem;">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width:24px;"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                </div>
                <div class="alert-text">
                    <strong style="display:block; color:#166534; font-size:1.05rem;">Expected Delivery: ${expDate}</strong>
                    <span style="color:#15803d; font-size:0.9rem;">Usually arrives between 4:00 PM - 8:00 PM</span>
                </div>
            `;
        }
    }

    function renderSidebar(order, item) {
        // Mini Snapshot
        if (item) {
            document.getElementById('to-summary-snapshot').innerHTML = `
                <img src="${item.snapshot_image || '/media/placeholder.png'}" alt="${item.snapshot_name}" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid #e5e7eb;">
                <div class="mini-details" style="flex:1;">
                    <h4 style="margin:0 0 0.25rem 0; font-size:0.95rem; color:#111827;">${item.snapshot_name}</h4>
                    <span style="display:block; font-size:0.8rem; color:#6b7280; margin-bottom:0.25rem;">${item.snapshot_weight} | Qty: ${item.quantity}</span>
                    <strong style="color:#8C2B22; font-size:0.95rem;">₹${item.line_total}</strong>
                </div>
            `;
        }

        // Price List
        document.getElementById('to-price-list').innerHTML = `
            <div class="price-row" style="display:flex; justify-content:space-between; margin-bottom:0.75rem; color:#4b5563; font-size:0.9rem;">
                <span>Subtotal</span> <strong>₹${order.subtotal || 0}</strong>
            </div>
            ${order.discount_applied > 0 ? `
            <div class="price-row" style="display:flex; justify-content:space-between; margin-bottom:0.75rem; color:#4b5563; font-size:0.9rem;">
                <span>Discount</span> <strong class="text-green" style="color:#15803d;">- ₹${order.discount_applied}</strong>
            </div>` : ''}
            <div class="price-row" style="display:flex; justify-content:space-between; margin-bottom:0.75rem; color:#4b5563; font-size:0.9rem;">
                <span>Delivery Charge</span> <strong>₹${order.delivery_charge || 0}</strong>
            </div>
        `;

        document.getElementById('to-price-total').innerHTML = `
            <span style="font-size:1rem; color:#374151;">Total Paid</span>
            <strong style="font-size:1.25rem; color:#8C2B22;">₹${order.total_amount || 0}</strong>
        `;

        // Update View Details link
        document.getElementById('to-view-details-btn').href = `/pages/order-details.html?id=${order.order_id}`;

        // Address
        const landmarkHTML = order.shipping_landmark ? `${order.shipping_landmark},<br>` : '';
        document.getElementById('to-delivery-address').innerHTML = `
            <h4 style="margin-top:0; margin-bottom:0.5rem; font-size:1.05rem; color:#111827;">${order.shipping_name || 'N/A'}</h4>
            <p class="address-text" style="color:#4b5563; font-size:0.9rem; line-height:1.5; margin:0 0 0.75rem 0;">
                ${order.shipping_address_line || 'Address missing'},<br>
                ${landmarkHTML}
                ${order.shipping_city || ''}, ${order.shipping_state || ''} - ${order.shipping_pin_code || ''}<br>
                ${order.shipping_country || ''}
            </p>
            <p class="phone-text" style="color:#4b5563; font-size:0.9rem; font-weight:500; display:flex; align-items:center; gap:0.5rem; margin:0;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                ${order.shipping_phone || 'N/A'}
            </p>
        `;
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

    // Run the data fetch
    init();
}

// Execute immediately
bootstrapTrackOrderPage();