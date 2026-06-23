const VALID_TABS = new Set(['home', 'gear', 'partners', 'merch', 'contact', 'hns']);
const contentArea = document.getElementById('content-area');
let selectedProfile = 'gaming';

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
    setActiveTab(target);
    contentArea.classList.add('is-loading');

    if (updateHistory) {
        history.pushState({ tab: target }, '', target === 'home' ? '/' : `/${target}`);
    }

    try {
        const response = await fetch(`/pages/${target}.html`, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Page request failed: ${response.status}`);
        contentArea.innerHTML = await response.text();
        initializeProfileCards();
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
    if (scroll) document.getElementById('creator-channels')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initializeProfileCards() {
    if (!document.querySelector('[data-profile-panel]')) return;
    activateProfile(selectedProfile, { persist: false });
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

function metricExact(metric) {
    const value = typeof metric === 'number' ? metric : metric?.value;
    return Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : '';
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

        const updated = document.querySelector('[data-stats-updated]');
        if (updated && data.updatedAt) {
            const date = new Date(data.updatedAt);
            updated.textContent = `Metrics refreshed ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
        }

        const totalNode = document.querySelector('[data-total-audience]');
        if (totalNode) {
            const total = Object.values(data.metrics || {})
                .flatMap((group) => Object.values(group || {}))
                .reduce((sum, metric) => sum + (typeof metric === 'number' ? metric : Number(metric?.value) || 0), 0);
            totalNode.textContent = total ? `${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(total)}+` : 'Growing daily';
        }
    } catch (error) {
        console.error('Metric loading failed:', error);
        metricNodes.forEach((node) => { node.textContent = 'View profile'; });
    }
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
        activateProfile(profilePanel.dataset.profilePanel, { persist: false });
    });

    document.addEventListener('pointerout', (event) => {
        if (event.pointerType === 'touch') return;
        const duo = event.target.closest('.profile-duo');
        if (!duo || duo.contains(event.relatedTarget)) return;
        activateProfile(selectedProfile, { persist: false });
    });

    document.addEventListener('focusin', (event) => {
        const profilePanel = event.target.closest('[data-profile-panel]');
        if (profilePanel) activateProfile(profilePanel.dataset.profilePanel, { persist: false });
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
}

document.addEventListener('DOMContentLoaded', () => {
    bindInteractions();
    document.getElementById('current-year').textContent = new Date().getFullYear();

    const redirectedPath = sessionStorage.getItem('redirectPath');
    if (redirectedPath) sessionStorage.removeItem('redirectPath');
    const initialTab = cleanPath(redirectedPath || window.location.pathname);
    switchTab(initialTab, false);
});

window.switchTab = switchTab;
