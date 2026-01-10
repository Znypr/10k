const contentArea = document.getElementById('content-area');

// 1. The Main Switcher
async function switchTab(tabName) {
    // Highlight button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // Load Content
    try {
        const response = await fetch(`tabs/${tabName}.html`);
        if (response.ok) {
            contentArea.innerHTML = await response.text();
            
            // AUTOMATION: Load stats immediately after HTML is placed
            loadStats(); 
            
            // Re-init icons if needed
            if(window.lucide) window.lucide.createIcons();
        } else {
            contentArea.innerHTML = `<p style="text-align:center;">Error loading tab.</p>`;
        }
    } catch (e) {
        console.error(e);
    }
}

// 2. The Automation Logic
async function loadStats() {
    try {
        const response = await fetch('assets/stats.json');
        const data = await response.json();

        // A. Update Socials & Goals (Existing code)
        safeUpdate('stat-yt', data.socials.youtube_subs + " Subscribers");
        safeUpdate('stat-tt', data.socials.tiktok_followers + " Followers");
        safeUpdate('stat-tw', data.socials.twitch_followers + " Followers");
        safeUpdate('stat-x',  data.socials.twitter_followers + " Followers");
        safeUpdate('stat-di', data.socials.discord_members + " Members");
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

        // --- NEW: HALL OF FAME AUTOMATION ---
        
        // 1. Render Shorts
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

        // 2. Render Videos
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

function safeUpdate(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

switchTab('home');