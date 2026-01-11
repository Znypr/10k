// 1. The Main Switcher
async function switchTab(tabName, updateHistory = true) {
    // CRITICAL FIX: Find the element *inside* the function to ensure it exists
    const contentArea = document.getElementById('content-area');
    if (!contentArea) {
        console.error("Critical: Could not find #content-area element.");
        return;
    }

    // A. Highlight the button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Handle edge case: 'home' might be '' in the URL
    const targetBtn = tabName === '' ? 'home' : tabName;
    // Use a safer selector check
    const activeBtn = document.querySelector(`button[onclick="switchTab('${targetBtn}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // B. Update URL (The Clean URL Magic)
    if (updateHistory) {
        const newPath = tabName === 'home' ? '/' : tabName;
        history.pushState({ tab: tabName }, '', newPath);
    }

    // C. Load Content
    try {
        const file = tabName === '' || tabName === '/' ? 'home' : tabName;
        // Ensure we look in the pages folder
        const response = await fetch(`/pages/${file}.html`);
        
        if (response.ok) {
            contentArea.innerHTML = await response.text();
            
            // D. Load Stats (Automation)
            loadStats(); 
            
            // E. Re-init Icons (if used)
            if(window.lucide) window.lucide.createIcons();
        } else {
            // If 404, fallback to home (prevent infinite loop)
            if (tabName !== 'home') switchTab('home');
        }
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = "<p style='text-align:center'>Error loading content.</p>";
    }
}

// 2. The Stats Automation
async function loadStats() {
    try {
        const response = await fetch('/assets/stats.json');
        const data = await response.json();

        // Helpers
        const safeUpdate = (id, text) => { 
            const el = document.getElementById(id); 
            if(el) el.textContent = text; 
        };

        // Socials Tab
        safeUpdate('stat-yt', data.socials.youtube_subs + " Subscribers");
        safeUpdate('stat-tt', data.socials.tiktok_followers + " Followers");
        safeUpdate('stat-tw', data.socials.twitch_followers + " Followers");
        safeUpdate('stat-x',  data.socials.twitter_followers + " Followers");
        safeUpdate('stat-di', data.socials.discord_members + " Members");

        // Home Tab
        safeUpdate('stat-home-subs', data.socials.youtube_subs);
        
        const bar = document.getElementById('progress-fill');
        if (bar) {
            const percent = (data.goals.current_subs / data.goals.goal_subs) * 100;
            bar.style.width = percent + "%";
        }

        const badge = document.getElementById('status-badge');
        if (badge) {
            if (data.goals.live_status === "live") {
                badge.className = "status-badge status-live";
                badge.innerHTML = '<div class="status-dot"></div><span>LIVE NOW</span>';
            } else {
                badge.className = "status-badge status-offline";
                badge.innerHTML = '<div class="status-dot"></div><span>OFFLINE</span>';
            }
        }

        // Hall of Fame Automation
        const shortsContainer = document.getElementById('hof-shorts');
        if (shortsContainer && data.hall_of_fame) {
            shortsContainer.innerHTML = data.hall_of_fame.shorts.map(item => `
                <a href="${item.link}" target="_blank" class="highlight-card">
                    <div class="thumb-wrap ratio-vertical">
                        <img src="${item.thumb}" class="thumb-img" alt="Thumbnail">
                        <div class="view-badge">${item.views}</div>
                        <div class="type-badge">Short</div>
                    </div>
                    <div class="highlight-title">${item.title}</div>
                </a>
            `).join('');
        }

        const videosContainer = document.getElementById('hof-videos');
        if (videosContainer && data.hall_of_fame) {
            videosContainer.innerHTML = data.hall_of_fame.videos.map(item => `
                <a href="${item.link}" target="_blank" class="highlight-card">
                    <div class="thumb-wrap ratio-landscape">
                        <img src="${item.thumb}" class="thumb-img" alt="Thumbnail">
                        <div class="view-badge">${item.views}</div>
                        <div class="type-badge red-badge">Video</div>
                    </div>
                    <div class="highlight-title">${item.title}</div>
                </a>
            `).join('');
        }

    } catch (error) {
        console.error("Stats loading failed:", error);
    }
}

// 3. Handle "Back" Button
window.addEventListener('popstate', (event) => {
    const tab = event.state ? event.state.tab : 'home';
    switchTab(tab, false);
});

// 4. Initial Load Logic (WRAPPED IN DOMContentLoaded)
document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname.substring(1).replace(/\/$/, ""); 

    // If it's a legal sub-page, let the browser load it normally
    if (path.startsWith('contact/') && path !== 'contact') {
        // No JS intervention for legal pages
        return;
    } 
    
    const validTabs = ['home', 'gear', 'socials', 'partners', 'merch', 'contact'];
    // Handle 'contact' specifically to load the app tab, not the folder
    let target = path === '' ? 'home' : path;
    
    // If user goes to /contact (clean), treat as contact tab
    if (target === 'contact') {
        switchTab('contact', false);
    } else if (validTabs.includes(target)) {
        switchTab(target, false);
    } else {
        switchTab('home', false);
    }
});