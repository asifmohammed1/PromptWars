/* StarDev — Application Logic */

const LANG_COLORS = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516', HTML: '#e34c26', CSS: '#563d7c' };
const getLangColor = (lang) => LANG_COLORS[lang] || '#8888a0';

// ========== Particle Background ==========
function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    class P {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.s = Math.random() * 2 + 0.5;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = (Math.random() - 0.5) * 0.3;
            this.o = Math.random() * 0.3 + 0.1;
        }
        update() {
            this.x += this.vx; this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }
        draw() {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.s, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(124, 92, 252, ${this.o})`; ctx.fill();
        }
    }
    for (let i = 0; i < 60; i++) particles.push(new P());
    const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    };
    animate();
}

// ========== GitHub API ==========
const GITHUB_API = 'https://api.github.com';

async function fetchGitHubUser(username) {
    const res = await fetch(`${GITHUB_API}/users/${username}`);
    if (!res.ok) {
        if (res.status === 404) throw new Error(`User "${username}" not found on GitHub`);
        if (res.status === 403) throw new Error('GitHub API rate limit exceeded. Please try again in a minute.');
        throw new Error(`GitHub API error: ${res.status}`);
    }
    return res.json();
}

async function fetchUserRepos(username) {
    const allRepos = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const res = await fetch(`${GITHUB_API}/users/${username}/repos?per_page=${perPage}&page=${page}&sort=updated&type=owner`);
        if (!res.ok) break;
        const repos = await res.json();
        if (repos.length === 0) break;
        allRepos.push(...repos);
        if (repos.length < perPage) break;
        page++;
        if (page > 5) break; // max 500 repos
    }

    return allRepos;
}

async function fetchRepoLanguages(username, repoName) {
    try {
        const res = await fetch(`${GITHUB_API}/repos/${username}/${repoName}/languages`);
        if (!res.ok) return {};
        return res.json();
    } catch (err) {
        console.warn('Failed to fetch languages for', repoName, err);
        return {};
    }
}

async function fetchUserEvents(username) {
    try {
        const res = await fetch(`${GITHUB_API}/users/${username}/events/public?per_page=100`);
        if (!res.ok) return [];
        return res.json();
    } catch (err) {
        console.warn('Failed to fetch events', err);
        return [];
    }
}

// ========== Data Processing ==========
function computeLanguageStats(repos, detailedLangs) {
    const langBytes = {};

    // Use detailed language data if available
    for (const [repoName, langs] of Object.entries(detailedLangs)) {
        for (const [lang, bytes] of Object.entries(langs)) {
            langBytes[lang] = (langBytes[lang] || 0) + bytes;
        }
    }

    // Fallback to repo primary language
    if (Object.keys(langBytes).length === 0) {
        repos.forEach(repo => {
            if (repo.language) {
                langBytes[repo.language] = (langBytes[repo.language] || 0) + (repo.size || 1);
            }
        });
    }

    const total = Object.values(langBytes).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(langBytes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([lang, bytes]) => ({
            name: lang,
            bytes,
            percentage: ((bytes / total) * 100).toFixed(1)
        }));

    return sorted;
}

function computeActivityData(events) {
    // Generate a 52-week grid based on event timestamps
    const now = new Date();
    const weeks = 52;
    const grid = [];

    for (let w = weeks - 1; w >= 0; w--) {
        const week = [];
        for (let d = 0; d < 7; d++) {
            const date = new Date(now);
            date.setDate(date.getDate() - (w * 7 + (6 - d)));
            const dateStr = date.toISOString().split('T')[0];
            week.push({ date: dateStr, count: 0, level: 0 });
        }
        grid.push(week);
    }

    // Count events per day
    const dayCounts = {};
    events.forEach(event => {
        const day = event.created_at?.split('T')[0];
        if (day) dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    // Map counts to levels
    const maxCount = Math.max(1, ...Object.values(dayCounts));
    grid.forEach(week => {
        week.forEach(cell => {
            cell.count = dayCounts[cell.date] || 0;
            if (cell.count === 0) cell.level = 0;
            else if (cell.count <= maxCount * 0.25) cell.level = 1;
            else if (cell.count <= maxCount * 0.5) cell.level = 2;
            else if (cell.count <= maxCount * 0.75) cell.level = 3;
            else cell.level = 4;
        });
    });

    return grid;
}

// ========== UI Rendering ==========
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    const page = document.getElementById(pageId);
    page.style.display = 'block';
    // Trigger reflow for animation
    void page.offsetHeight;
    page.classList.add('active');
    
    if (pageId !== 'loading-page') {
        window.scrollTo(0, 0);
    }
}

function showError(msg) {
    const el = document.getElementById('error-message');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function updateLoaderStatus(text, progress) {
    document.getElementById('loader-status').textContent = text;
    document.getElementById('loader-progress-bar').style.width = progress + '%';
}

function renderPortfolioHero(user) {
    document.getElementById('portfolio-avatar').src = user.avatar_url;
    document.getElementById('portfolio-avatar').alt = `${user.login}'s avatar`;
    document.getElementById('portfolio-name').textContent = user.name || user.login;
    document.getElementById('portfolio-bio').textContent = user.bio || 'A passionate developer building cool things on GitHub.';

    // Meta info
    const metaItems = [];
    if (user.location) {
        metaItems.push(`<span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${user.location}
        </span>`);
    }
    if (user.company) {
        metaItems.push(`<span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
            ${user.company}
        </span>`);
    }
    if (user.blog) {
        const url = user.blog.startsWith('http') ? user.blog : `https://${user.blog}`;
        metaItems.push(`<span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            <a href="${url}" target="_blank">${user.blog.replace(/^https?:\/\//, '')}</a>
        </span>`);
    }
    metaItems.push(`<span class="meta-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        <a href="${user.html_url}" target="_blank">@${user.login}</a>
    </span>`);

    document.getElementById('portfolio-meta').innerHTML = metaItems.join('');

    // Stats
    const totalStars = window._repoData?.reduce((sum, r) => sum + (r.stargazers_count || 0), 0) || 0;
    const totalForks = window._repoData?.reduce((sum, r) => sum + (r.forks_count || 0), 0) || 0;
    
    const stats = [
        { value: user.public_repos, label: 'Repos' },
        { value: totalStars, label: 'Stars' },
        { value: totalForks, label: 'Forks' },
        { value: user.followers, label: 'Followers' },
        { value: user.following, label: 'Following' }
    ];

    document.getElementById('portfolio-stats').innerHTML = stats.map(s => `
        <div class="stat-card">
            <div class="stat-value">${formatNumber(s.value)}</div>
            <div class="stat-label">${s.label}</div>
        </div>
    `).join('');
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function renderSkills(langStats) {
    const container = document.getElementById('skills-container');
    container.innerHTML = langStats.map((lang, i) => `
        <div class="skill-row" style="animation-delay: ${i * 0.05}s">
            <div class="skill-label">
                <span class="skill-dot" style="background: ${getLangColor(lang.name)}"></span>
                ${lang.name}
            </div>
            <div class="skill-bar-track">
                <div class="skill-bar-fill" 
                     data-width="${lang.percentage}" 
                     style="background: ${getLangColor(lang.name)}"></div>
            </div>
            <span class="skill-percentage">${lang.percentage}%</span>
        </div>
    `).join('');

    // Animate bars
    requestAnimationFrame(() => {
        setTimeout(() => {
            container.querySelectorAll('.skill-bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.width + '%';
            });
        }, 100);
    });
}

function renderProjects(repos) {
    // Sort by stars, then by updated
    const sorted = [...repos].sort((a, b) => {
        const starDiff = (b.stargazers_count || 0) - (a.stargazers_count || 0);
        if (starDiff !== 0) return starDiff;
        return new Date(b.updated_at) - new Date(a.updated_at);
    });

    // Build language filter
    const languages = new Set(['All']);
    sorted.forEach(r => { if (r.language) languages.add(r.language); });

    const filterContainer = document.getElementById('projects-filter');
    filterContainer.innerHTML = Array.from(languages).slice(0, 10).map(lang => `
        <button class="filter-btn ${lang === 'All' ? 'active' : ''}" data-filter="${lang}">${lang}</button>
    `).join('');

    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filterContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderProjectCards(sorted, btn.dataset.filter);
        });
    });

    renderProjectCards(sorted, 'All');
}

function renderProjectCards(repos, filter) {
    const grid = document.getElementById('projects-grid');
    const filtered = filter === 'All' ? repos : repos.filter(r => r.language === filter);
    const display = filtered.slice(0, 12);

    grid.innerHTML = display.map((repo, i) => `
        <div class="project-card" style="animation-delay: ${i * 0.05}s">
            <div class="project-header">
                <a href="${repo.html_url}" target="_blank" class="project-name">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                    ${repo.name}
                </a>
                <span class="project-visibility">${repo.private ? 'Private' : 'Public'}</span>
            </div>
            <p class="project-desc">${repo.description || 'No description provided.'}</p>
            <div class="project-footer">
                <div class="project-lang">
                    ${repo.language ? `<span class="project-lang-dot" style="background: ${getLangColor(repo.language)}"></span> ${repo.language}` : '—'}
                </div>
                <div class="project-stats-row">
                    ${repo.stargazers_count > 0 ? `
                        <span class="project-stat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            ${formatNumber(repo.stargazers_count)}
                        </span>
                    ` : ''}
                    ${repo.forks_count > 0 ? `
                        <span class="project-stat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a2 2 0 01-2 2H8a2 2 0 01-2-2V9"/><path d="M12 12v3"/></svg>
                            ${formatNumber(repo.forks_count)}
                        </span>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function renderActivity(activityGrid) {
    const container = document.getElementById('activity-grid');

    container.innerHTML = activityGrid.map(week => `
        <div class="activity-week">
            ${week.map(cell => `
                <div class="activity-cell" 
                     data-level="${cell.level}" 
                     title="${cell.date}: ${cell.count} contribution${cell.count !== 1 ? 's' : ''}">
                </div>
            `).join('')}
        </div>
    `).join('');

    document.getElementById('activity-legend').innerHTML = `
        Less
        <div class="legend-cell" style="background: rgba(255,255,255,0.03)"></div>
        <div class="legend-cell" style="background: rgba(124,92,252,0.2)"></div>
        <div class="legend-cell" style="background: rgba(124,92,252,0.4)"></div>
        <div class="legend-cell" style="background: rgba(124,92,252,0.6)"></div>
        <div class="legend-cell" style="background: rgba(124,92,252,0.85)"></div>
        More
    `;
}

// ========== Download as HTML ==========
function downloadPortfolio() {
    const portfolioPage = document.getElementById('portfolio-page');
    if (!portfolioPage) return;
    const clone = portfolioPage.cloneNode(true);

    // Remove nav actions
    const navActions = clone.querySelector('.portfolio-nav-actions');
    if (navActions) navActions.remove();

    // Get computed styles
    const styles = document.querySelector('link[href="style.css"]');
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${document.getElementById('portfolio-name').textContent} — Developer Portfolio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>${document.querySelector('style')?.textContent || ''}
    ${Array.from(document.styleSheets).map(sheet => {
        try {
            return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
        } catch (e) { return ''; }
    }).join('\n')}
    .page { display: block; opacity: 1; }
    .portfolio-nav { position: relative; }
    </style>
</head>
<body>
    ${clone.outerHTML}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${document.getElementById('portfolio-name').textContent.replace(/\s+/g, '_')}_portfolio.html`;
    a.click();
    URL.revokeObjectURL(url);
}

// ========== Main Flow ==========
async function generatePortfolio(username) {
    const btn = document.getElementById('generate-btn');
    btn.disabled = true;

    showPage('loading-page');

    try {
        // Step 1: Fetch user
        updateLoaderStatus('Fetching GitHub profile...', 10);
        const user = await fetchGitHubUser(username);

        // Step 2: Fetch repos
        updateLoaderStatus('Loading repositories...', 30);
        const repos = await fetchUserRepos(username);
        window._repoData = repos;

        // Step 3: Fetch detailed languages for top repos
        updateLoaderStatus('Analyzing tech stack...', 50);
        const topRepos = repos
            .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
            .slice(0, 15);

        const detailedLangs = {};
        const langPromises = topRepos.map(async repo => {
            const langs = await fetchRepoLanguages(username, repo.name);
            detailedLangs[repo.name] = langs;
        });
        await Promise.all(langPromises);

        // Step 4: Fetch events
        updateLoaderStatus('Building contribution map...', 75);
        const events = await fetchUserEvents(username);

        // Step 5: Process data
        updateLoaderStatus('Forging your portfolio...', 90);
        const langStats = computeLanguageStats(repos, detailedLangs);
        const activityGrid = computeActivityData(events);

        // Small delay for UX
        await new Promise(r => setTimeout(r, 600));
        updateLoaderStatus('Almost there...', 100);
        await new Promise(r => setTimeout(r, 400));

        // Step 6: Render
        renderPortfolioHero(user);
        renderSkills(langStats);
        renderProjects(repos);
        renderActivity(activityGrid);

        showPage('portfolio-page');

    } catch (err) {
        showPage('landing-page');
        showError(err.message);
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try { initParticles(); } catch (e) {}
    const input = document.getElementById('github-username');
    const btn = document.getElementById('generate-btn');
    if (!input || !btn) return;
    const trigger = () => {
        const user = input.value.trim();
        if (user) generatePortfolio(user);
        else showError('Enter a username');
    };
    btn.onclick = trigger;
    input.onkeydown = (e) => { if (e.key === 'Enter') trigger(); };
    document.querySelectorAll('.hint-btn').forEach(b => b.onclick = () => { input.value = b.dataset.username; trigger(); });
    document.getElementById('back-btn').onclick = () => showPage('landing-page');
    document.getElementById('download-btn').onclick = downloadPortfolio;
});
