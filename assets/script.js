// 1. Define where the tabs live
const contentArea = document.getElementById('content-area');

// 2. Load a Tab (The Switcher)
async function switchTab(tabName) {
    // A. Highlight the button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // B. Load the content
    try {
        const response = await fetch(`tabs/${tabName}.html`);
        
        if (response.ok) {
            const html = await response.text();
            contentArea.innerHTML = html;
            
            // Re-initialize icons if used
            if(window.lucide) window.lucide.createIcons();
            
        } else {
            console.error(`Failed to load tabs/${tabName}.html`);
            contentArea.innerHTML = `<p style="text-align:center; color:#555;">Error loading tab.</p>`;
        }
    } catch (e) {
        console.error(e);
    }
}

// 3. Start at Home
switchTab('home');