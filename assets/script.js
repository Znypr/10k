const contentArea = document.getElementById('content-area');

// 1. The Main Switcher
async function switchTab(tabName, updateHistory = true) {
    // A. Highlight the button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // Handle edge case: 'home' might be '' in the URL
    const targetBtn = tabName === '' ? 'home' : tabName;
    const activeBtn = document.querySelector(`button[onclick="switchTab('${targetBtn}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // B. Update URL (The Clean URL Magic)
    if (updateHistory) {
        // If tab is 'home', we make the URL clean (znypr.com/), otherwise /gear
        const newPath = tabName === 'home' ? '/' : tabName;
        history.pushState({ tab: tabName }, '', newPath);
    }

    // C. Load Content
    try {
        // Fetch the file. Default to home.html if empty
        const file = tabName === '' || tabName === '/' ? 'home' : tabName;
        const response = await fetch(`tabs/${file}.html`);
        
        if (response.ok) {
            contentArea.innerHTML = await response.text();
            
            // D. Load Stats (Automation)
            loadStats(); 
            
            // E. Re-init Icons (if used)
            if(window.lucide) window.lucide.createIcons();
        } else {
            // If 404, fallback to home
            if (tabName !== 'home') switchTab('home');
        }
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = "<p style='text-align:center'>Error loading content.</p>";
    }
}

// 2. The Stats Automation (From previous step)
async function loadStats() {
    try {
        const response = await fetch('assets/stats.json');
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
    // When user clicks Back in browser, load that tab
    const tab = event.state ? event.state.tab : 'home';
    switchTab(tab, false); // false = don't push state again
});

// 4. Initial Load (Read the URL!)
// Remove the leading slash (e.g., "/gear" -> "gear")
const path = window.location.pathname.substring(1);
const validTabs = ['home', 'socials', 'shop', 'partners', 'gear', 'more'];

if (validTabs.includes(path)) {
    switchTab(path, false); // Load it without pushing new state
} else {
    switchTab('home', false); // Default to home
}