// --- 1. SPA-SAFE GLOBALS ---
window.ADDRESS_ICONS = {
    Home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    Office: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm4-16h2v2H7V5zm0 4h2v2H7V9zm0 4h2v2H7v-2zm4-8h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2zm4-8h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2zM3 21V3h18v18H3z"/></svg>',
    Other: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>'
};

// --- 2. DEFINE CORE RENDER FUNCTION FIRST (Fixes the crash) ---
window.renderAddresses = function() {
    const grid = document.getElementById('address-grid');
    const countSpan = document.getElementById('address-count');
    if (!grid) return;

    let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
    let activeAddresses = addresses.filter(a => a.deleted_at === null);

    if (countSpan) countSpan.textContent = activeAddresses.length;

    // EMPTY STATE
    if (activeAddresses.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: #6b7280;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 64px; height: 64px; margin-bottom: 1rem; opacity: 0.5; display: inline-block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <h3 style="color: #374151; margin-bottom: 0.5rem; font-size: 1.25rem;">No Addresses Found</h3>
                <p>You haven't saved any delivery addresses yet.</p>
            </div>
        `;
        return;
    }

    // BUILD CARDS
    grid.innerHTML = activeAddresses.map(addr => {
        const typeLower = addr.address_type.toLowerCase();
        return `
        <div class="address-card">
            <div class="card-body">
                <div class="card-header-row" style="display: flex; align-items: center; gap: 0.5rem;">
                    <div class="icon-box icon-${typeLower}">${window.ADDRESS_ICONS[addr.address_type] || window.ADDRESS_ICONS['Other']}</div>
                    <span class="tag tag-${typeLower}">${addr.address_type}</span>
                    ${addr.is_default ? `<span class="default-badge" style="margin-left: auto;"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Default</span>` : ''}
                </div>
                <div class="card-details">
                    ${addr.label ? `<div class="label-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path></svg> Label: ${addr.label}</div>` : ''}
                    <h3 class="recipient-name">${addr.recipient_name}</h3>
                    <p class="address-lines">
                        ${addr.address_line}<br>
                        ${addr.landmark ? `${addr.landmark}<br>` : ''}
                        ${addr.city} - ${addr.pin_code}<br>
                        ${addr.state}, India
                    </p>
                    <div class="phone-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> ${addr.phone_number}</div>
                </div>
            </div>
            <div class="card-actions">
                <button class="action-btn edit-btn" data-id="${addr.address_id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button>
                <button class="action-btn remove-btn" data-id="${addr.address_id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Remove</button>
                ${!addr.is_default ? `<button class="action-btn set-default-btn" data-id="${addr.address_id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Set Default</button>` : ''}
            </div>
        </div>
        `;
    }).join('');
};

// --- 3. DEFINE INITIALIZER ---
window.initAddresses = function() {
    const grid = document.getElementById('address-grid');
    if (grid && !grid.hasAttribute('data-rendered')) {
        grid.setAttribute('data-rendered', 'true');
        window.renderAddresses(); 
    }
};

// --- 4. EXECUTE & OBSERVE ---
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", window.initAddresses);
} else {
    window.initAddresses();
}

if (!window.addressObserver) {
    window.addressObserver = new MutationObserver(window.initAddresses);
    window.addressObserver.observe(document.body, { childList: true, subtree: true });
}

// --- 5. EVENT DELEGATION & FORM HANDLING ---
if (!window.addressEventsInitialized) {
    
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('addressModal');
        const form = document.getElementById('addressForm');
        const toast = document.querySelector('.toast-notification');

        // OPEN "ADD NEW" MODAL
        if (e.target.closest('#openAddModalBtn')) {
            if (modal && form) {
                form.reset();
                form.removeAttribute('data-edit-id'); 
                modal.querySelector('.modal-header h2').textContent = 'Add New Address';
                modal.querySelector('.btn-save').textContent = 'Save Address';
                
                document.querySelectorAll('.radio-box').forEach(b => b.classList.remove('active'));
                const homeRadio = document.querySelector('.radio-box input[value="Home"]');
                if(homeRadio) homeRadio.closest('.radio-box').classList.add('active');
                
                modal.classList.add('active');
            }
        }
        
        // CLOSE MODAL / TOAST
        else if (e.target.closest('#closeModalBtn') || e.target.closest('#cancelModalBtn')) {
            if (modal) modal.classList.remove('active');
        }
        else if (e.target.closest('.close-toast')) {
            if (toast) toast.style.display = 'none';
        }

        // CUSTOM RADIO BUTTONS
        const radioBox = e.target.closest('.radio-box');
        if (radioBox && modal && modal.contains(radioBox)) {
            document.querySelectorAll('.radio-box').forEach(b => b.classList.remove('active'));
            radioBox.classList.add('active');
            radioBox.querySelector('input').checked = true;
        }

        // EDIT ADDRESS
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn && modal && form) {
            const id = editBtn.getAttribute('data-id');
            let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
            const addr = addresses.find(a => a.address_id === id);
            
            if (addr) {
                form.setAttribute('data-edit-id', id); 
                modal.querySelector('.modal-header h2').textContent = 'Update Address';
                modal.querySelector('.btn-save').textContent = 'Update Address';

                document.querySelectorAll('.radio-box').forEach(b => b.classList.remove('active'));
                const targetRadio = document.querySelector(`input[name="addressType"][value="${addr.address_type}"]`);
                if (targetRadio) {
                    targetRadio.checked = true;
                    targetRadio.closest('.radio-box').classList.add('active');
                }

                document.getElementById('addr-label').value = addr.label || '';
                document.getElementById('addr-name').value = addr.recipient_name || '';
                
                const phoneParts = addr.phone_number.split(' ');
                if (phoneParts.length > 1) {
                    document.getElementById('addr-code').value = phoneParts[0];
                    document.getElementById('addr-phone').value = phoneParts.slice(1).join(' ');
                } else {
                    document.getElementById('addr-phone').value = addr.phone_number;
                }

                document.getElementById('addr-line').value = addr.address_line || '';
                document.getElementById('addr-landmark').value = addr.landmark || '';
                document.getElementById('addr-city').value = addr.city || '';
                document.getElementById('addr-state').value = addr.state || '';
                document.getElementById('addr-pin').value = addr.pin_code || '';

                modal.classList.add('active');
            }
        }

        // REMOVE ADDRESS 
        const removeBtn = e.target.closest('.remove-btn');
        if (removeBtn) {
            if(confirm("Are you sure you want to remove this address?")) {
                const id = removeBtn.getAttribute('data-id');
                let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
                const index = addresses.findIndex(a => a.address_id === id);
                if(index > -1) {
                    addresses[index].deleted_at = new Date().toISOString(); 
                    localStorage.setItem('user_addresses', JSON.stringify(addresses));
                    window.renderAddresses();
                }
            }
        }

        // SET DEFAULT ADDRESS
        const defaultBtn = e.target.closest('.set-default-btn');
        if (defaultBtn) {
            const id = defaultBtn.getAttribute('data-id');
            let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
            addresses.forEach(a => {
                a.is_default = (a.address_id === id);
                a.updated_at = new Date().toISOString();
            });
            localStorage.setItem('user_addresses', JSON.stringify(addresses));
            window.renderAddresses();
            
            if(toast) {
                toast.style.display = 'flex';
                setTimeout(() => toast.style.display = 'none', 3000);
            }
        }
    });

    // --- 6. FORM SUBMISSION ---
    document.addEventListener('submit', (e) => {
        if (e.target.id === 'addressForm') {
            e.preventDefault();
            
            const form = e.target;
            const editId = form.getAttribute('data-edit-id');
            let addresses = JSON.parse(localStorage.getItem('user_addresses')) || [];
            const isFirstAddress = addresses.filter(a => a.deleted_at === null).length === 0;

            const addressData = {
                user_id: 'U1001',
                address_type: document.querySelector('input[name="addressType"]:checked').value,
                label: document.getElementById('addr-label').value.trim() || null,
                recipient_name: document.getElementById('addr-name').value.trim(),
                phone_number: document.getElementById('addr-code').value + ' ' + document.getElementById('addr-phone').value.trim(),
                address_line: document.getElementById('addr-line').value.trim(),
                landmark: document.getElementById('addr-landmark').value.trim() || null,
                city: document.getElementById('addr-city').value.trim(),
                state: document.getElementById('addr-state').value,
                pin_code: document.getElementById('addr-pin').value.trim(),
            };

            if (editId) {
                // UPDATE
                const index = addresses.findIndex(a => a.address_id === editId);
                if (index > -1) {
                    addresses[index] = { ...addresses[index], ...addressData, updated_at: new Date().toISOString() };
                }
            } else {
                // CREATE
                addresses.push({
                    ...addressData,
                    address_id: 'A' + Date.now(),
                    is_default: isFirstAddress,
                    created_at: new Date().toISOString(),
                    updated_at: null,
                    deleted_at: null
                });
            }

            localStorage.setItem('user_addresses', JSON.stringify(addresses));
            
            const modal = document.getElementById('addressModal');
            if (modal) modal.classList.remove('active');
            
            window.renderAddresses();
        }
    });

    window.addressEventsInitialized = true;
}