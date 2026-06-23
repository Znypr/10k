const VALID_TABS = new Set(['home', 'gear', 'partners', 'merch', 'contact', 'hns']);
const SWIPE_TABS = ['home', 'gear', 'partners', 'merch', 'contact'];
const MOBILE_QUERY = window.matchMedia('(max-width: 900px)');
const contentArea = document.getElementById('content-area');

let activePageTab = 'home';
let selectedProfile = 'gaming';
let hoverActivationTimer = null;
let profileVisibilityObserver = null;
let touchStart = null;

function cleanPath(pathname = window.location.pathname) {
    return pathname.replace(/^\/+|\/+$/g, '') || 'home';
}

function setActiveTab(tabName) {
    document.querySelectorAll('[data-tab]').forEach((element) => {
        const isActive = element.dataset.tab === tabName;
        element.classList.toggle('active', isActive);
        if (element.classList.contains('nav-btn')) {
            element.setAttribute('aria-current', isActive ? 'page' : 'false');
        }
    });
}

async function switchTab(tabName = 'home', updateHistory = true) {
    const target = VALID_TABS.has(tabName) ? tabName : 'home';
    activePageTab = target;
    setActiveTab(target);
    contentArea.classList.add('is-loading');
    profileVisibilityObserver?.disconnect();

    if (updateHistory) {
        history.pushState({ tab: target }, '', target === 'home' ? '/' : `/${target}`);
    }

    try {
        const response = await fetch(`/pages/${target}.html`, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Page request failed: ${response.status}`);
        contentArea.innerHTML = await response.text();
        initializeProfileCards();
        initializeMobileProfileObserver();
        await loadStats();
        contentArea.focus({ preventScroll: true });
        document.title = target === 'home'
            ? 'ZNYPR — Gaming & Fitness Creator'
            : `${target.charAt(0).toUpperCase()}${target.slice(1)} — ZNYPR`;
    } catch (error) {
        console.error(error);
        contentArea.innerHTML = `
            <section class="surface empty-state">
                <span class="eyebrow">Error</span>
                <h1>This page could not be loaded.</h1>
                <button class="button button-primary" type="button" data-retry>Try again</button>
            </section>`;
        contentArea.querySelector('[data-retry]')?.addEventListener('click', () => switchTab(target, false));
    } finally {
        contentArea.classList.remove('is-loading');
    }
}

function activateProfile(profile, { persist = true, scroll = false } = {}) {
    const panel = document.querySelector(`[data-profile-panel="${profile}"]`);
    if (!panel) return;

    document.querySelectorAll('[data-profile-panel]').forEach((candidate) => {
        const isActive = candidate.dataset.profilePanel === profile;
        candidate.classList.toggle('is-active', isActive);
        candidate.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('[data-profile-select]').forEach((button) => {
        const isActive = button.dataset.profileSelect === profile;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    document.querySelector('.profile-switcher')?.setAttribute('data-active-profile', profile);
    if (persist) selectedProfile = profile;

    if (scroll) {
        const target = MOBILE_QUERY.matches ? panel : document.getElementById('creator-channels');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function initializeProfileCards() {
    if (!document.querySelector('[data-profile-panel]')) return;
    activateProfile(selectedProfile, { persist: false });
}

function initializeMobileProfileObserver() {
    profileVisibilityObserver?.disconnect();
    profileVisibilityObserver = null;

    const cards = [...document.querySelectorAll('[data-profile-panel]')];
    if (!MOBILE_QUERY.matches || cards.length < 2) return;

    const visibility = new Map(cards.map((card) => [card, 0]));
    profileVisibilityObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => visibility.set(entry.target, entry.intersectionRatio));

        const [mostVisibleCard, ratio] = [...visibility.entries()]
            .sort((first, second) => second[1] - first[1])[0] || [];

        if (mostVisibleCard && ratio >= 0.16) {
            activateProfile(mostVisibleCard.dataset.profilePanel, { persist: false });
        }
    }, {
        root: null,
        rootMargin: '-18% 0px -38% 0px',
        threshold: [0, 0.1, 0.16, 0.25, 0.4, 0.55, 0.7, 0.85]
    });

    cards.forEach((card) => profileVisibilityObserver.observe(card));
}

function metricDisplay(metric) {
    if (metric == null) return 'View profile';
    if (typeof metric === 'number') return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(metric);
    if (metric.display) return metric.display;
    if (Number.isFinite(metric.value)) {
        return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(metric.value);
    }
    return 'View profile';
}

function metricValue(metric) {
    const value = typeof metric === 'number' ? metric : metric?.value;
    return Number.isFinite(value) ? value : 0;
}

function metricExact(metric) {
    const value = metricValue(metric);
    return value ? new Intl.NumberFormat('en-US').format(value) : '';
}

function compactNumber(value) {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

async function loadStats() {
    const metricNodes = document.querySelectorAll('[data-stat]');
    if (!metricNodes.length) return;

    try {
        const response = await fetch('/assets/stats.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Stats request failed: ${response.status}`);
        const data = await response.json();

        metricNodes.forEach((node) => {
            const [group, platform] = node.dataset.stat.split('.');
            const metric = data.metrics?.[group]?.[platform];
            node.textContent = metricDisplay(metric);
            const exact = metricExact(metric);
            if (exact) node.title = `${exact} ${metric?.unit || ''}`.trim();
            node.closest('.social-card')?.classList.toggle('metric-unavailable', !exact && !metric?.display);
        });

        document.querySelectorAll('[data-group-total]').forEach((node) => {
            const group = node.dataset.groupTotal;
            const total = Object.values(data.metrics?.[group] || {}).reduce((sum, metric) => sum + metricValue(metric), 0);
            const valueNode = node.querySelector('strong');
            if (valueNode) valueNode.textContent = total ? compactNumber(total) : '—';
            node.title = total
                ? `${new Intl.NumberFormat('en-US').format(total)} known followers and subscribers`
                : 'No public audience metrics available';
        });

        const updated = document.querySelector('[data-stats-updated]');
        if (updated && data.updatedAt) {
            const date = new Date(data.updatedAt);
            updated.textContent = `Metrics refreshed ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
        }

        const totalNode = document.querySelector('[data-total-audience]');
        if (totalNode) {
            const total = Object.values(data.metrics || {})
                .flatMap((group) => Object.values(group || {}))
                .reduce((sum, metric) => sum + metricValue(metric), 0);
            totalNode.textContent = total ? `${compactNumber(total)}+` : 'Growing daily';
        }
    } catch (error) {
        console.error('Metric loading failed:', error);
        metricNodes.forEach((node) => { node.textContent = 'View profile'; });
    }
}

function navigateBySwipe(direction) {
    const currentIndex = SWIPE_TABS.indexOf(activePageTab);
    if (currentIndex < 0) return;

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= SWIPE_TABS.length) return;

    switchTab(SWIPE_TABS[targetIndex]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindMobilePageSwipe() {
    document.addEventListener('touchstart', (event) => {
        if (!MOBILE_QUERY.matches || event.touches.length !== 1 || contentArea.classList.contains('is-loading')) return;
        if (event.target.closest('.nav-links, input, textarea, select, [contenteditable="true"], [data-no-page-swipe]')) return;

        const touch = event.touches[0];
        const edgeGuard = 28;
        if (touch.clientX <= edgeGuard || touch.clientX >= window.innerWidth - edgeGuard) return;

        touchStart = {
            x: touch.clientX,
            y: touch.clientY,
            time: performance.now()
        };
    }, { passive: true });

    document.addEventListener('touchend', (event) => {
        if (!touchStart || !MOBILE_QUERY.matches || !event.changedTouches.length) {
            touchStart = null;
            return;
        }

        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        const duration = performance.now() - touchStart.time;
        touchStart = null;

        const horizontalDistance = Math.abs(deltaX);
        const verticalDistance = Math.abs(deltaY);
        if (duration > 850 || horizontalDistance < 72 || horizontalDistance < verticalDistance * 1.45) return;

        navigateBySwipe(deltaX < 0 ? 1 : -1);
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        touchStart = null;
    }, { passive: true });
}

function bindInteractions() {
    document.addEventListener('click', (event) => {
        const tabButton = event.target.closest('[data-tab]');
        if (tabButton) {
            event.preventDefault();
            switchTab(tabButton.dataset.tab);
            return;
        }

        const profileButton = event.target.closest('[data-profile-select]');
        if (profileButton) {
            activateProfile(profileButton.dataset.profileSelect, {
                scroll: profileButton.hasAttribute('data-scroll-to-deck')
            });
            return;
        }

        const profilePanel = event.target.closest('[data-profile-panel]');
        if (profilePanel) activateProfile(profilePanel.dataset.profilePanel);
    });

    document.addEventListener('pointerover', (event) => {
        if (event.pointerType === 'touch') return;
        const profilePanel = event.target.closest('[data-profile-panel]');
        if (!profilePanel || profilePanel.contains(event.relatedTarget)) return;
        clearTimeout(hoverActivationTimer);
        hoverActivationTimer = setTimeout(() => {
            activateProfile(profilePanel.dataset.profilePanel, { persist: false });
        }, 45);
    });

    document.addEventListener('pointerout', (event) => {
        if (event.pointerType === 'touch') return;
        const duo = event.target.closest('.profile-duo');
        if (!duo || duo.contains(event.relatedTarget)) return;
        clearTimeout(hoverActivationTimer);
        hoverActivationTimer = setTimeout(() => {
            activateProfile(selectedProfile, { persist: false });
        }, 70);
    });

    document.addEventListener('focusin', (event) => {
        const profilePanel = event.target.closest('[data-profile-panel]');
        if (profilePanel && !MOBILE_QUERY.matches) {
            activateProfile(profilePanel.dataset.profilePanel, { persist: false });
        }
    });

    document.addEventListener('keydown', (event) => {
        const currentCard = event.target.closest('[data-profile-panel]');
        if (!currentCard || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const nextProfile = currentCard.dataset.profilePanel === 'gaming' ? 'fitness' : 'gaming';
        activateProfile(nextProfile);
        document.querySelector(`[data-profile-panel="${nextProfile}"]`)?.focus();
    });

    window.addEventListener('popstate', (event) => {
        switchTab(event.state?.tab || cleanPath(), false);
    });

    MOBILE_QUERY.addEventListener('change', () => {
        initializeProfileCards();
        initializeMobileProfileObserver();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindInteractions();
    bindMobilePageSwipe();
    document.getElementById('current-year').textContent = new Date().getFullYear();

    const redirectedPath = sessionStorage.getItem('redirectPath');
    if (redirectedPath) sessionStorage.removeItem('redirectPath');
    const initialTab = cleanPath(redirectedPath || window.location.pathname);
    switchTab(initialTab, false);
});

window.switchTab = switchTab;
