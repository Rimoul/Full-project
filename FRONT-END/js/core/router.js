// /FRONT-END/js/core/router.js

document.addEventListener('click', async (e) => {
    const link = e.target.closest('a');
    
    // Ignore non-links or external links
    if (!link || !link.href.startsWith(window.location.origin)) return;

    // 1. ISOLATE THE HASH JUMP FIX
    const rawHref = link.getAttribute('href');
    if (rawHref === '#' || rawHref === '') {
        e.preventDefault(); 
        return; // Stops the flicker without trying to load a new page
    }
    // Do not treat in-page links as full page navigation.
    if (rawHref.startsWith('#')) {
        return;
    }
    
    const targetUrl = link.href;
    const targetPath = new URL(targetUrl).pathname.toLowerCase();
    
    // Authentication page: use a normal browser navigation.
    // This prevents the previous page's header/footer from carrying over.
    if (targetPath.endsWith('/pages/log.html')) {
        window.location.assign(targetUrl);
        return;
    }
    
    e.preventDefault();

    try {
        const response = await fetch(targetUrl);
        
        // 2. EXPOSE REAL SERVER ERRORS
        // If the server throws a 404 or 500, force the browser to actually load the error page natively.
        if (!response.ok) {
            window.location.href = targetUrl;
            return; 
        }

        const htmlText = await response.text();
        const virtualDoc = new DOMParser().parseFromString(htmlText, 'text/html');

        const currentLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        const newLinks = Array.from(virtualDoc.querySelectorAll('link[rel="stylesheet"]'));
        
        const currentHrefs = currentLinks.map(l => l.getAttribute('href'));
        const newHrefs = newLinks.map(l => l.getAttribute('href'));

        // 3. SURGICAL CSS REMOVAL
        currentLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;
            
            const isGlobal = href.includes('header.css') || 
                             href.includes('footer.css') || 
                             href.includes('global.css') || 
                             href.includes('master.css');
                             
            const isNeededInNewPage = newHrefs.includes(href);
            
            if (!isGlobal && !isNeededInNewPage) {
                link.remove();
            }
        });

        // 4. INJECT NEW CSS & PAUSE
        const cssPromises = [];
        newLinks.forEach(link => {
            const href = link.getAttribute('href');
            
            if (href && !currentHrefs.includes(href)) {
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = href;
                
                cssPromises.push(new Promise(resolve => {
                    newLink.onload = resolve;
                    newLink.onerror = resolve; 
                }));
                
                document.head.appendChild(newLink);
            }
        });

        await Promise.all(cssPromises);
        
        // 4.5 INJECT NEW SCRIPTS
                // Find all current scripts on the page and all scripts on the new page
                const currentScripts = Array.from(document.querySelectorAll('script')).map(s => s.getAttribute('src')).filter(Boolean);
                const newScripts = Array.from(virtualDoc.querySelectorAll('script'));
        
                newScripts.forEach(script => {
                    const src = script.getAttribute('src');
                    // If the new page has a script we haven't loaded yet, inject it!
                    if (src && !currentScripts.includes(src)) {
                        const newScript = document.createElement('script');
                        newScript.src = src;
                        document.body.appendChild(newScript);
                    }
                });
        
                // 5. PERFECT DOM SWAP
                const currentMain = document.querySelector('main');

        const newMain = virtualDoc.querySelector('main');
        
        if (currentMain && newMain) {
            currentMain.replaceWith(newMain);
        }

        // 6. SVG REPAINT
        document.querySelectorAll('svg').forEach(svg => {
            svg.outerHTML = svg.outerHTML;
        });

        // 7. UPDATE HISTORY
                document.title = virtualDoc.title;
                window.history.pushState({}, '', targetUrl);
                window.scrollTo({ top: 0, behavior: 'smooth' });
        
                // 8. FIRE CUSTOM EVENT FOR JS SCRIPTS
                // This tells all our JS files that the page just changed
                document.dispatchEvent(new Event('pageNavigated'));
        
            } catch (error) {
                // Expose network failures natively
                window.location.href = targetUrl;
    }
});

window.addEventListener('popstate', () => {
    window.location.reload(); 
});