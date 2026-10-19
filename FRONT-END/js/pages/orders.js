// ==========================================================================
// ALL ORDERS PAGE LOGIC - SEAZONAL SWAAD
// ==========================================================================

function bootstrapOrdersPage() {
    const container = document.getElementById('orders-list-container');
    const tabsContainer = document.getElementById('orders-filter-tabs');
    const summaryContainer = document.getElementById('order-summary-metrics');
    const searchInput = document.getElementById('order-search-input');
    const searchBtn = document.getElementById('btn-search-orders');
    const sortSelect = document.getElementById('order-sort-select');

    // 1. SPA Router Safety: Wait for DOM elements to exist
    if (!container || !tabsContainer || !summaryContainer) {
        setTimeout(bootstrapOrdersPage, 50);
        return;
    }

    // Prevent duplicate event listeners if the router runs this twice
    if (container.dataset.bootstrapped === 'true') return;
    container.dataset.bootstrapped = 'true';

    // 2. Inject Animations (Only if they don't already exist)
    if (!document.getElementById('orders-timeline-styles')) {
        const style = document.createElement('style');
        style.id = 'orders-timeline-styles';
        style.innerHTML = `
            @keyframes popStep { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
            @keyframes fillLine { 0% { transform: scaleX(0); opacity: 0; } 100% { transform: scaleX(1); opacity: 1; } }
            .anim-pop { animation: popStep 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
            .anim-line { transform-origin: left; animation: fillLine 0.4s ease-out both; }
        `;
        document.head.appendChild(style);
    }

    // 3. State Management
    let allOrders = [];
    let orderItems = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let sortOrder = 'latest';

    // 4. Data Fetching
    async function init() {
        try {
            // Path matches your working setup
            const response = await fetch('/tables4.json'); 
            const data = await response.json();
            
            allOrders = data.orders.filter(o => o.user_id === 'U1001');
            orderItems = data.order_items;

            applyFiltersAndRender();
        } catch (error) {
            console.error("Failed to load orders:", error);
            if (container) container.innerHTML = '<div style="text-align:center; padding: 3rem; color: #6b7280;">Failed to load orders. Please try again later.</div>';
        }
    }

    // 5. Filtering & Sorting Logic
    function applyFiltersAndRender() {
        if (!container) return;

        let processedOrders = [...allOrders];

        if (currentFilter !== 'all') {
            processedOrders = processedOrders.filter(order => {
                const status = order.current_status;
                if (currentFilter === 'processing') return status === 'Placed' || status === 'Packed';
                if (currentFilter === 'shipped') return status === 'Shipped' || status === 'Out_For_Delivery';
                if (currentFilter === 'delivered') return status === 'Delivered';
                if (currentFilter === 'cancelled') return status === 'Cancelled';
                return true;
            });
        }

        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            processedOrders = processedOrders.filter(order => {
                const matchesId = order.order_number.toLowerCase().includes(lowerQuery);
                const items = orderItems.filter(i => i.order_id === order.order_id);
                const matchesItem = items.some(i => i.snapshot_name.toLowerCase().includes(lowerQuery));
                return matchesId || matchesItem;
            });
        }

        processedOrders.sort((a, b) => {
            const dateA = new Date(a.placed_at).getTime();
            const dateB = new Date(b.placed_at).getTime();
            return sortOrder === 'latest' ? dateB - dateA : dateA - dateB;
        });

        renderOrders(processedOrders);
        updateMetrics(allOrders); 
    }

    // 6. Render Individual Order Cards
    function renderOrders(ordersToRender) {
        if (ordersToRender.length === 0) {
            let emptyTitle = 'No orders found';
            let emptyDesc = "We couldn't find any orders matching your criteria.";
            let emptyAction = `<a href="/pages/all-products.html" class="btn-filled" style="text-decoration:none;">Start Shopping</a>`;

            if (allOrders.length === 0) {
                emptyTitle = 'No orders yet';
                emptyDesc = "Looks like you haven't placed any orders with us yet.";
            } else if (searchQuery) {
                emptyTitle = 'No results found';
                emptyDesc = `We couldn't find any orders matching "${searchQuery}".`;
                emptyAction = `<button class="btn-outline btn-clear-search">Clear Search</button>`;
            } else {
                emptyAction = `<button class="btn-outline btn-clear-filter">View Active Orders</button>`;
                if (currentFilter === 'processing') {
                    emptyTitle = 'No processing orders';
                    emptyDesc = "You don't have any orders currently being prepared.";
                } else if (currentFilter === 'shipped') {
                    emptyTitle = 'No shipped orders';
                    emptyDesc = "None of your orders are currently in transit.";
                } else if (currentFilter === 'delivered') {
                    emptyTitle = 'No delivered orders yet';
                    emptyDesc = "You don't have any completed deliveries at the moment.";
                } else if (currentFilter === 'cancelled') {
                    emptyTitle = 'No cancelled orders';
                    emptyDesc = "Great news! You don't have any cancelled orders.";
                }
            }

            container.innerHTML = `
                <div style="text-align:center; padding: 5rem 2rem; background: #fff; border-radius:12px; border: 1px solid #e5e7eb; animation: popStep 0.4s ease-out;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:64px; height:64px; color:#9ca3af; margin-bottom:1rem;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    <h3 style="color:#374151; font-size:1.25rem; margin-bottom:0.5rem;">${emptyTitle}</h3>
                    <p style="color:#6b7280; margin-bottom:1.5rem;">${emptyDesc}</p>
                    ${emptyAction}
                </div>
            `;
            return;
        }

        container.innerHTML = ordersToRender.map(order => {
            const items = orderItems.filter(i => i.order_id === order.order_id);
            const firstItem = items[0];
            const extraItemsCount = items.length - 1;
            const placedDate = new Date(order.placed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            
            const statusConfig = getStatusConfig(order.current_status);
            const timelineHTML = buildTimelineHTML(order.current_status, order.placed_at, order.expected_delivery);

            return `
                <div class="order-card" data-status="${order.current_status.toLowerCase()}">
                    <div class="card-header">
                        <div class="header-info">
                            <strong class="order-id">Order #${order.order_number}</strong>
                            <span class="order-date">Placed on ${placedDate}</span>
                        </div>
                        <span class="status-badge ${statusConfig.badgeClass}">${statusConfig.icon} ${statusConfig.text}</span>
                    </div>
                    <div class="card-body">
                        <div class="product-snapshot">
                            <img src="${firstItem.snapshot_image}" alt="${firstItem.snapshot_name}">
                            <div class="snapshot-details">
                                <h3>${firstItem.snapshot_name}</h3>
                                <span class="weight">${firstItem.snapshot_weight}</span>
                                <span class="price">₹${order.total_amount}</span>
                                <span class="qty">Qty: ${firstItem.quantity} ${extraItemsCount > 0 ? `<em style="color:#6b7280; font-size:0.85rem; margin-left:0.5rem;">+ ${extraItemsCount} more item(s)</em>` : ''}</span>
                            </div>
                        </div>
                        
                        <div class="tracking-container">
                            ${timelineHTML}
                        </div>
                        
                        <div class="card-actions">
                            ${order.current_status !== 'Delivered' && order.current_status !== 'Cancelled' ? `
                                <a href="/pages/track-order.html?id=${order.order_id}" class="btn-filled" style="text-decoration: none;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; margin-right:6px; display:inline-block; vertical-align:middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> Track Order
                                </a>
                            ` : `
                                <button class="btn-outline btn-buy-again" data-variant-id="${firstItem.variant_id}" data-qty="1">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; margin-right:6px; display:inline-block; vertical-align:middle;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.5l.89 1.93"></path></svg> Buy Again
                                </button>
                            `}
                            <a href="/pages/order-details.html?id=${order.order_id}" class="btn-outline" style="text-decoration: none;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; margin-right:6px; display:inline-block; vertical-align:middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> 
                                View Details
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 7. Dynamic UI Helpers
    function getStatusConfig(status) {
        switch(status) {
            case 'Placed': 
            case 'Packed': 
                return { text: status, badgeClass: 'badge-blue', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' };
            case 'Shipped': 
                return { text: 'Shipped', badgeClass: 'badge-blue', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>' };
            case 'Out_For_Delivery': 
                return { text: 'Out for Delivery', badgeClass: 'badge-green', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>' };
            case 'Delivered': 
                return { text: 'Delivered', badgeClass: 'badge-green', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' };
            case 'Cancelled': 
                return { text: 'Cancelled', badgeClass: 'badge-red', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>' };
            default: 
                return { text: 'Processing', badgeClass: 'badge-blue', icon: '' };
        }
    }
    
    function buildTimelineHTML(status, placedDateStr, expectedDateStr) {
        if (status === 'Cancelled') {
            return `
                <div class="delivery-estimate" style="background:#fef2f2; color:#991b1b; padding:1rem; border-radius:8px; display:flex; align-items:center; gap:0.75rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    <strong>This order was cancelled.</strong>
                </div>`;
        }

        const placedDate = new Date(placedDateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const expectedDateFull = expectedDateStr ? new Date(expectedDateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pending';
        
        const levels = { 'Placed': 1, 'Packed': 2, 'Shipped': 3, 'Out_For_Delivery': 4, 'Delivered': 5 };
        const currentLevel = levels[status] || 1;

        const getStepClass = (level) => level < currentLevel ? 'completed' : (level === currentLevel ? (status === 'Delivered' ? 'completed' : 'current-blue') : 'pending');
        const getLineClass = (level) => level < currentLevel ? 'completed' : 'pending';
        const getIcon = (level) => level <= currentLevel ? '✔' : '';

        const getAnimPop = (level) => level <= currentLevel ? `anim-pop` : '';
        const getAnimLine = (level) => level < currentLevel ? `anim-line` : '';
        const getDelayPop = (level) => `style="animation-delay: ${(level - 1) * 0.25}s"`;
        const getDelayLine = (level) => `style="animation-delay: ${((level - 1) * 0.25) + 0.15}s"`;

        return `
            <div class="timeline">
                <div class="step ${getStepClass(1)}"><div class="icon ${getAnimPop(1)}" ${getDelayPop(1)}>${getIcon(1)}</div><span>Placed<br>${placedDate}</span></div>
                <div class="line ${getLineClass(1)} ${getAnimLine(1)}" ${getDelayLine(1)}></div>
                
                <div class="step ${getStepClass(2)}"><div class="icon ${getAnimPop(2)}" ${getDelayPop(2)}>${getIcon(2)}</div><span>Packed</span></div>
                <div class="line ${getLineClass(2)} ${getAnimLine(2)}" ${getDelayLine(2)}></div>
                
                <div class="step ${getStepClass(3)}"><div class="icon ${getAnimPop(3)}" ${getDelayPop(3)}>${getIcon(3)}</div><span>Shipped</span></div>
                <div class="line ${getLineClass(3)} ${getAnimLine(3)}" ${getDelayLine(3)}></div>
                
                <div class="step ${getStepClass(4)}"><div class="icon ${getAnimPop(4)}" ${getDelayPop(4)}>${getIcon(4)}</div><span>Out for Delivery</span></div>
                <div class="line ${getLineClass(4)} ${getAnimLine(4)}" ${getDelayLine(4)}></div>
                
                <div class="step ${getStepClass(5)}"><div class="icon ${getAnimPop(5)}" ${getDelayPop(5)}>${getIcon(5)}</div><span>Delivered</span></div>
            </div>
            <div class="delivery-estimate ${status === 'Delivered' ? 'text-green' : 'text-blue'}" style="display:flex; align-items:center; gap:0.5rem; margin-top:1rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                <strong>${status === 'Delivered' ? 'Delivered on' : 'Expected Delivery:'} ${expectedDateFull}</strong>
            </div>
        `;
    }

    function updateMetrics(orders) {
        const counts = {
            all: orders.length,
            processing: orders.filter(o => o.current_status === 'Placed' || o.current_status === 'Packed').length,
            shipped: orders.filter(o => o.current_status === 'Shipped' || o.current_status === 'Out_For_Delivery').length,
            delivered: orders.filter(o => o.current_status === 'Delivered').length,
            cancelled: orders.filter(o => o.current_status === 'Cancelled').length
        };

        if (tabsContainer) {
            tabsContainer.innerHTML = `
                <button class="tab-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">All Orders (${counts.all})</button>
                <button class="tab-btn ${currentFilter === 'processing' ? 'active' : ''}" data-filter="processing">Processing (${counts.processing})</button>
                <button class="tab-btn ${currentFilter === 'shipped' ? 'active' : ''}" data-filter="shipped">Shipped (${counts.shipped})</button>
                <button class="tab-btn ${currentFilter === 'delivered' ? 'active' : ''}" data-filter="delivered">Delivered (${counts.delivered})</button>
                <button class="tab-btn ${currentFilter === 'cancelled' ? 'active' : ''}" data-filter="cancelled">Cancelled (${counts.cancelled})</button>
            `;
        }

        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <li class="${currentFilter === 'all' ? 'active' : ''}"><span>All Orders</span> <strong>${counts.all}</strong></li>
                <li class="${currentFilter === 'processing' ? 'active' : ''}"><span>Processing</span> <strong>${counts.processing}</strong></li>
                <li class="${currentFilter === 'shipped' ? 'active' : ''}"><span>Shipped</span> <strong>${counts.shipped}</strong></li>
                <li class="${currentFilter === 'delivered' ? 'active' : ''}"><span>Delivered</span> <strong>${counts.delivered}</strong></li>
                <li class="${currentFilter === 'cancelled' ? 'active' : ''}"><span>Cancelled</span> <strong>${counts.cancelled}</strong></li>
            `;
        }
    }

    // 8. Event Listeners
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                currentFilter = e.target.getAttribute('data-filter');
                applyFiltersAndRender();
            }
        });
    }

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            searchQuery = searchInput.value.trim();
            applyFiltersAndRender();
        });
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                searchQuery = searchInput.value.trim();
                applyFiltersAndRender();
            }
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortOrder = e.target.value;
            applyFiltersAndRender();
        });
    }

    container.addEventListener('click', (e) => {
        const clearFilterBtn = e.target.closest('.btn-clear-filter');
        const clearSearchBtn = e.target.closest('.btn-clear-search');
        
        if (clearFilterBtn) {
            currentFilter = 'all';
            if (tabsContainer) {
                tabsContainer.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                tabsContainer.querySelector('[data-filter="all"]').classList.add('active');
            }
            applyFiltersAndRender();
        }
        
        if (clearSearchBtn) {
            searchQuery = '';
            if (searchInput) searchInput.value = '';
            applyFiltersAndRender();
        }

        const buyBtn = e.target.closest('.btn-buy-again');
        if (buyBtn) {
            const variantId = buyBtn.getAttribute('data-variant-id');
            const qty = parseInt(buyBtn.getAttribute('data-qty')) || 1;
            
            const payload = [{ variant_id: variantId, quantity: qty }];
            sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
            sessionStorage.setItem('checkout_mode', 'buy_now');
            
            window.location.href = '/pages/checkout.html';
        }
    });

    // Run the data fetch
    init();
}

// Execute immediately
bootstrapOrdersPage();