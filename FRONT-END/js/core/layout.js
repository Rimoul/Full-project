// /FRONT-END/js/core/layout.js

document.addEventListener('click', function(event) {
    const searchOverlay = document.getElementById('searchOverlay');
    const searchInput = document.getElementById('searchInput');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const menuToggleBtnMain = document.getElementById('menuToggle');

    // =========================================
    // 1. CLICK-OUTSIDE LOGIC
    // =========================================
    
    if (searchOverlay && searchOverlay.classList.contains('active')) {
        if (!event.target.closest('#searchOverlay') && !event.target.closest('#searchToggleBtn')) {
            searchOverlay.classList.remove('active');
            searchInput.value = '';
        }
    }

    if (dropdownMenu && dropdownMenu.classList.contains('active')) {
        if (!event.target.closest('#dropdownMenu') && !event.target.closest('#menuToggle')) {
            dropdownMenu.classList.remove('active');
            menuToggleBtnMain.querySelector('.icon-hamburger').style.display = 'block';
            menuToggleBtnMain.querySelector('.icon-close').style.display = 'none';
            document.body.classList.remove('no-scroll'); // Unlock background
        }
    }

    // =========================================
    // 2. SEARCH LOGIC: Toggle & Focus
    // =========================================
    const searchToggleBtn = event.target.closest('#searchToggleBtn');
    const closeSearchBtn = event.target.closest('#closeSearchBtn');

    if (searchToggleBtn) {
        if (searchOverlay.classList.contains('active')) {
            searchOverlay.classList.remove('active');
            searchInput.value = '';
        } else {
            searchOverlay.classList.add('active');
            
            setTimeout(() => {
                searchInput.focus();
            }, 50);
            
            if (dropdownMenu && dropdownMenu.classList.contains('active')) {
                dropdownMenu.classList.remove('active');
                menuToggleBtnMain.querySelector('.icon-hamburger').style.display = 'block';
                menuToggleBtnMain.querySelector('.icon-close').style.display = 'none';
                document.body.classList.remove('no-scroll'); // Unlock background
            }
        }
        return;
    }
    
    if (closeSearchBtn) {
        searchOverlay.classList.remove('active');
        searchInput.value = ''; 
        return;
    }

    // =========================================
    // 3. HEADER LOGIC: Hamburger Toggle
    // =========================================
    const menuToggleBtn = event.target.closest('#menuToggle');
    if (menuToggleBtn) {
        const iconHamburger = menuToggleBtn.querySelector('.icon-hamburger');
        const iconClose = menuToggleBtn.querySelector('.icon-close');
        
        if (searchOverlay && searchOverlay.classList.contains('active')) {
            searchOverlay.classList.remove('active');
            searchInput.value = '';
        }
        
        if (dropdownMenu) {
            dropdownMenu.classList.toggle('active');
            
            if (dropdownMenu.classList.contains('active')) {
                iconHamburger.style.display = 'none';
                iconClose.style.display = 'block';
                document.body.classList.add('no-scroll'); // Lock background
            } else {
                iconHamburger.style.display = 'block';
                iconClose.style.display = 'none';
                document.body.classList.remove('no-scroll'); // Unlock background
            }
        }
        return; 
    }

    // =========================================
    // 4. FOOTER LOGIC: Mobile Accordions
    // =========================================
    const toggle = event.target.closest('.accordion-toggle');
    if (!toggle) return; 

    const arrow = toggle.querySelector('.arrow');
    if (arrow && window.getComputedStyle(arrow).display === 'none') {
        return; 
    }

    const content = toggle.nextElementSibling;
    const isCurrentlyOpen = content.style.maxHeight;

    document.querySelectorAll('.accordion-content').forEach(c => {
        c.style.maxHeight = null;
        c.style.paddingBottom = "0px";
    });
    document.querySelectorAll('.accordion-toggle .arrow').forEach(a => {
        a.style.transform = 'rotate(0deg)';
    });

    if (!isCurrentlyOpen) {
        content.style.maxHeight = content.scrollHeight + 15 + "px"; 
        content.style.paddingBottom = "15px";
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
});

// =========================================
// 5. SCROLL LOGIC: Auto-Close Search
// =========================================
window.addEventListener('scroll', function() {
    const searchOverlay = document.getElementById('searchOverlay');
    const searchInput = document.getElementById('searchInput');
    
    if (searchOverlay && searchOverlay.classList.contains('active')) {
        searchOverlay.classList.remove('active');
        searchInput.value = '';
        searchInput.blur(); 
    }
});

// =========================================
// 6. RESIZE LOGIC: Reset States on Desktop
// =========================================
window.addEventListener('resize', function() {
    if (window.innerWidth >= 992) {
        document.querySelectorAll('.accordion-content').forEach(c => {
            c.style.maxHeight = null;
            c.style.paddingBottom = "0px";
        });
        document.querySelectorAll('.accordion-toggle .arrow').forEach(a => {
            a.style.transform = 'rotate(0deg)';
        });
        
        const dropdownMenu = document.getElementById('dropdownMenu');
        const menuToggleBtn = document.getElementById('menuToggle');
        
        if (dropdownMenu && menuToggleBtn) {
            dropdownMenu.classList.remove('active');
            menuToggleBtn.querySelector('.icon-hamburger').style.display = 'block';
            menuToggleBtn.querySelector('.icon-close').style.display = 'none';
            document.body.classList.remove('no-scroll'); // Unlock background just in case
        }
    }
});

// =========================================
// AUTO-CLOSE SIDEBAR ON LINK CLICK
// =========================================
document.addEventListener('click', (e) => {
    // Check if the clicked element is a link inside the dropdown menu
    const menuLink = e.target.closest('.header-dropdown-menu a');
    
    if (menuLink) {
        const menu = document.getElementById('dropdownMenu');
        const hamburger = document.querySelector('.icon-hamburger');
        const closeIcon = document.querySelector('.icon-close');
        
        // Remove the active classes and reset the icons
        menu.classList.remove('active');
        hamburger.style.display = 'block';
        closeIcon.style.display = 'none';
        
        // Unlock the background scrolling
        document.body.classList.remove('no-scroll'); 
    }
});