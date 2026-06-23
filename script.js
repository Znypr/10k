const VALID_TABS = new Set(['home', 'gear', 'partners', 'merch', 'contact', 'hns']);
const contentArea = document.getElementById('content-area');

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

function metricDisplay(metric) {
    if (metric == null) return 'Not public';
    if (typeof metric === 'number') return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(metric);
    if (metric.display) return metric.display;
    if (Number.isFinite(metric.value)) {
        return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(metric.value);
    }
    return 'Not public';
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
        metricNodes.forEach((node) => { node.textContent = 'Live profile'; });
    }
}

function bindNavigation() {
    document.addEventListener('click', (event) => {
        const tabButton = event.target.closest('[data-tab]');
        if (!tabButton) return;
        event.preventDefault();
        switchTab(tabButton.dataset.tab);
    });

    window.addEventListener('popstate', (event) => {
        switchTab(event.state?.tab || cleanPath(), false);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindNavigation();
    document.getElementById('current-year').textContent = new Date().getFullYear();

    const redirectedPath = sessionStorage.getItem('redirectPath');
    if (redirectedPath) sessionStorage.removeItem('redirectPath');
    const initialTab = cleanPath(redirectedPath || window.location.pathname);
    switchTab(initialTab, false);
});

window.switchTab = switchTab;
