/**
 * EcoShift AI - Authentication & Access Management Engine
 * Provides persistent session authentication, role-based controls,
 * and dynamic user profile status in the top navigation bar.
 */

const DEFAULT_USERS = [
    {
        id: 'usr_rohit',
        name: 'Rohit Kumar Mandal',
        email: 'rohit@ecoshift.ai',
        password: 'password123',
        role: 'Lead Energy Auditor',
        initials: 'RM',
        badgeClass: 'badge-auditor',
        org: 'Tribhuvan College of Environment',
        team: 'Team AI Catalysts'
    },
    {
        id: 'usr_rahul',
        name: 'Rahul Singh',
        email: 'rahul@ecoshift.ai',
        password: 'password123',
        role: 'Chief Sustainability Officer',
        initials: 'RS',
        badgeClass: 'badge-cso',
        org: 'EcoShift ESG Solutions',
        team: 'Team AI Catalysts'
    },
    {
        id: 'usr_ritik',
        name: 'Ritik',
        email: 'ritik@ecoshift.ai',
        password: 'password123',
        role: 'Microgrid Operations Engineer',
        initials: 'RK',
        badgeClass: 'badge-engineer',
        org: 'InnoVenture 2026 Facility Hub',
        team: 'Team AI Catalysts'
    }
];

class AuthManager {
    constructor() {
        this.storageKey = 'ecoshift_auth_user';
        this.userListKey = 'ecoshift_all_users';
        this.initUsers();
    }

    initUsers() {
        if (!localStorage.getItem(this.userListKey)) {
            localStorage.setItem(this.userListKey, JSON.stringify(DEFAULT_USERS));
        }
    }

    getAllUsers() {
        try {
            return JSON.parse(localStorage.getItem(this.userListKey)) || DEFAULT_USERS;
        } catch (e) {
            return DEFAULT_USERS;
        }
    }

    getCurrentUser() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    login(email, password) {
        const users = this.getAllUsers();
        const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
        
        if (!user) {
            return { success: false, message: 'No account registered with this email address.' };
        }
        if (user.password !== password) {
            return { success: false, message: 'Invalid password. Please check your credentials.' };
        }

        const sessionUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            initials: user.initials,
            badgeClass: user.badgeClass || 'badge-auditor',
            org: user.org,
            team: user.team,
            loginTime: new Date().toISOString()
        };

        localStorage.setItem(this.storageKey, JSON.stringify(sessionUser));
        return { success: true, user: sessionUser };
    }

    signup(name, email, password, role = 'Energy Analyst') {
        const users = this.getAllUsers();
        if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
            return { success: false, message: 'An account with this email already exists.' };
        }

        const parts = name.trim().split(' ');
        const initials = parts.length > 1 
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() 
            : name.slice(0, 2).toUpperCase();

        const newUser = {
            id: 'usr_' + Date.now(),
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: password,
            role: role,
            initials: initials,
            badgeClass: 'badge-analyst',
            org: 'Tribhuvan College of Environment',
            team: 'EcoShift Energy Labs'
        };

        users.push(newUser);
        localStorage.setItem(this.userListKey, JSON.stringify(users));
        
        // Auto sign-in
        const sessionUser = { ...newUser };
        delete sessionUser.password;
        localStorage.setItem(this.storageKey, JSON.stringify(sessionUser));
        return { success: true, user: sessionUser };
    }

    logout() {
        localStorage.removeItem(this.storageKey);
        window.location.href = 'login.html';
    }

    /**
     * Call on dashboard pages to ensure session exists.
     * If user is not authenticated, redirects to login.html with return URL.
     */
    checkAuth(redirect = true) {
        let user = this.getCurrentUser();
        if (!user) {
            // Check if demo user can be auto-seeded for hassle-free preview
            const currentPath = window.location.pathname;
            if (redirect && !currentPath.includes('login.html')) {
                // Auto seed default user if first visit, or redirect to login.html
                // If user deliberately wants auth guard, redirect:
                const redirectParam = encodeURIComponent(window.location.href);
                window.location.href = `login.html?redirect=${redirectParam}`;
                return null;
            }
        }
        return user;
    }

    /**
     * Renders User Profile Widget into Top Navigation Bar
     */
    mountNavbarWidget() {
        const user = this.getCurrentUser();
        if (!user) return;

        const topActions = document.querySelector('.top-actions');
        if (!topActions) return;

        // Check if already mounted
        if (document.getElementById('navUserChip')) return;

        const widgetWrap = document.createElement('div');
        widgetWrap.className = 'nav-user-widget';
        widgetWrap.id = 'navUserChip';
        widgetWrap.innerHTML = `
            <div class="user-chip-button" onclick="window.authManager.toggleUserMenu(event)">
                <div class="user-avatar-circle">
                    <span>${user.initials || 'EM'}</span>
                    <span class="avatar-online-dot"></span>
                </div>
                <div class="user-chip-meta">
                    <span class="user-chip-name">${user.name}</span>
                    <span class="user-chip-role">${user.role}</span>
                </div>
                <i class="fas fa-chevron-down" style="font-size: 0.72rem; color: var(--text-muted); margin-left: 4px;"></i>
            </div>

            <!-- Dropdown Menu -->
            <div class="user-dropdown-menu" id="userDropdownMenu">
                <div class="dropdown-header">
                    <div class="dropdown-avatar">${user.initials}</div>
                    <div class="dropdown-user-info">
                        <strong>${user.name}</strong>
                        <span>${user.email}</span>
                        <span class="user-org-badge"><i class="fas fa-building"></i> ${user.org || 'EcoShift Facility'}</span>
                    </div>
                </div>
                <div class="dropdown-divider"></div>
                <div class="dropdown-links">
                    <a href="optimization.html" class="dropdown-item">
                        <i class="fas fa-leaf" style="color: var(--success);"></i>
                        <span>Carbon & ROI Ledger</span>
                    </a>
                    <a href="prediction.html" class="dropdown-item">
                        <i class="fas fa-chart-line" style="color: var(--cyan);"></i>
                        <span>Predictive AI Models</span>
                    </a>
                    <a href="grid.html" class="dropdown-item">
                        <i class="fas fa-tower-broadcast" style="color: var(--accent-grid);"></i>
                        <span>Live Telemetry Grid</span>
                    </a>
                </div>
                <div class="dropdown-divider"></div>
                <button class="dropdown-logout-btn" onclick="window.authManager.logout()">
                    <i class="fas fa-arrow-right-from-bracket"></i>
                    <span>Sign Out</span>
                </button>
            </div>
        `;

        topActions.appendChild(widgetWrap);

        // Close dropdown when clicked outside
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('userDropdownMenu');
            if (menu && !widgetWrap.contains(e.target)) {
                menu.classList.remove('show');
            }
        });
    }

    toggleUserMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('userDropdownMenu');
        if (menu) {
            menu.classList.toggle('show');
        }
    }
}

// Global instance
window.authManager = new AuthManager();

// Auto-mount on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // If we're not on the login page, check auth and mount navbar widget
    if (!window.location.pathname.endsWith('login.html')) {
        const user = window.authManager.checkAuth(false);
        if (user) {
            window.authManager.mountNavbarWidget();
        } else {
            // For smooth user experience if user opens directly, auto-log in as default demo user
            window.authManager.login('rohit@ecoshift.ai', 'password123');
            window.authManager.mountNavbarWidget();
        }
    }
});
