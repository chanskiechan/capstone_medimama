// ===============================
// DOM ELEMENTS
// ===============================

const toggleBtn = document.getElementById('toggleSidebar');
const sidebar = document.querySelector('.sidebar');
const menuItems = document.querySelectorAll('.menu-item.has-submenu');
const menuLinks = document.querySelectorAll('.menu-link');
const submenuLinks = document.querySelectorAll('.submenu-link');
const profileLink = document.querySelector('.profile-link');
const profileItem = document.querySelector('.profile-item');
const profileMenuLinks = document.querySelectorAll('.profile-menu-link');

let isCollapsed = true;

function expandSidebar() {
    if (!sidebar) return;
    isCollapsed = false;
    sidebar.classList.remove('collapsed');
    localStorage.setItem('sidebarCollapsed', 'false');
    updateToggleButton();
}

// ===============================
// SIDEBAR TOGGLE FUNCTION
// ===============================

function toggleSidebar() {
    if (sidebar) {
        isCollapsed = !isCollapsed;
        sidebar.classList.toggle('collapsed');
        updateToggleButton();

        // Close all submenus when collapsed
        if (isCollapsed) {
            menuItems.forEach(item => {
                item.classList.remove('open');
                const submenu = item.querySelector('.submenu');
                if (submenu) {
                    submenu.classList.remove('open');
                }
            });
            if (profileItem && profileLink) {
                profileItem.classList.remove('open');
                profileLink.setAttribute('aria-expanded', 'false');
            }
        }

        // Save state to localStorage
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    }
}

function updateToggleButton() {
    if (!toggleBtn || !sidebar) return;

    const collapsed = sidebar.classList.contains('collapsed');
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
}

if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebar);
}

// ===============================
// RESTORE SIDEBAR STATE
// ===============================

function restoreSidebarState() {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null && sidebar) {
        isCollapsed = savedState === 'true';
        sidebar.classList.toggle('collapsed', isCollapsed);
    }
    updateToggleButton();
}

restoreSidebarState();

// Keep one shared navigation state across all admin pages.
const isHealthcarePage = window.location.pathname.toLowerCase().includes('healthcare-services');
const isMotherPage = window.location.pathname.toLowerCase().includes('/mothers/');
const isInfantPage = window.location.pathname.toLowerCase().includes('/infants/');
const isSystemPage = window.location.pathname.toLowerCase().includes('/system/');
const isProfilePage = window.location.pathname.toLowerCase().includes('/profile/');
const requestedTab = new URLSearchParams(window.location.search).get('tab') || 'prenatal';
if (isHealthcarePage) {
    expandSidebar();
    const healthcareParent = document.querySelector('[data-nav="healthcare"]');
    const healthcareItem = healthcareParent?.closest('.menu-item');
    healthcareParent?.classList.add('active');
    healthcareItem?.classList.add('open');
    healthcareItem?.querySelector('.submenu')?.classList.add('open');
    document.querySelector(`[data-healthcare-tab="${requestedTab}"]`)?.classList.add('active');
} else if (isMotherPage || isInfantPage) {
    expandSidebar();
    const patientParent = document.querySelector('[data-nav="patients"]');
    const patientItem = patientParent?.closest('.menu-item');
    patientParent?.classList.add('active');
    patientItem?.classList.add('open');
    patientItem?.querySelector('.submenu')?.classList.add('open');
    document.querySelector(isMotherPage ? '[data-nav="mothers"]' : '[data-nav="infants"]')?.classList.add('active');
} else if (isSystemPage) {
    expandSidebar();
    document.querySelector('[data-nav="system"]')?.classList.add('active');
} else if (isProfilePage) {
    expandSidebar();
    profileItem?.classList.add('open');
    profileLink?.setAttribute('aria-expanded', 'true');
} else if (window.location.pathname.toLowerCase().includes('/dashboard/')) {
    document.querySelector('[data-nav="dashboard"]')?.classList.add('active');
}

// ===============================
// SUBMENU TOGGLE
// ===============================

menuItems.forEach(item => {
    const link = item.querySelector('.menu-link');
    const submenu = item.querySelector('.submenu');

    if (link && submenu) {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            // A submenu must be visible before it can be opened. This also gives
            // collapsed-sidebar users one click to reveal Healthcare Services.
            if (sidebar?.classList.contains('collapsed')) expandSidebar();

            // Close other open submenus
            menuItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('open');
                    const otherSubmenu = otherItem.querySelector('.submenu');
                    if (otherSubmenu) {
                        otherSubmenu.classList.remove('open');
                    }
                }
            });

            // Toggle current submenu
            item.classList.toggle('open');
            submenu.classList.toggle('open');
        });
    }
});

// ===============================
// MENU ITEM ACTIVE STATE
// ===============================

menuLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        if (link.getAttribute('href') !== '#') return;
        e.preventDefault();

        // Remove active class from all links
        menuLinks.forEach(l => l.classList.remove('active'));

        // Add active class to clicked link
        link.classList.add('active');

        // Update page content
        const menuText = link.querySelector('.menu-text');
        if (menuText) {
            updateContent(menuText.textContent);
        }
    });
});

// ===============================
// SUBMENU ITEM ACTIVE STATE
// ===============================

submenuLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        // Healthcare record links move to another page/tab. Store the expanded
        // state first so the same full sidebar is shown after navigation. Once
        // already on Healthcare Services, switch the tab in place—no reload.
        if (link.dataset.healthcareTab) {
            expandSidebar();
            if (window.location.pathname.toLowerCase().includes('healthcare-services') && window.MediMamaHealthcare) {
                e.preventDefault();
                window.MediMamaHealthcare.selectTab(link.dataset.healthcareTab);
            }
            return;
        }
        if (link.getAttribute('href') !== '#') return;
        e.preventDefault();

        // Remove active class from all submenu links
        submenuLinks.forEach(l => l.classList.remove('active'));

        // Add active class to clicked link
        link.classList.add('active');

        // Update page content
        const linkText = link.querySelector('span');
        if (linkText) {
            updateContent(linkText.textContent);
        }
    });
});

// ===============================
// PROFILE LINK
// ===============================

if (profileLink) {
    profileLink.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = profileItem.classList.toggle('open');
        profileLink.setAttribute('aria-expanded', String(isOpen));
    });
}

profileMenuLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        if (link.getAttribute('href') !== '#') return;
        e.preventDefault();
        updateContent(link.dataset.page);
        profileItem.classList.remove('open');
        profileLink.setAttribute('aria-expanded', 'false');
    });
});

document.querySelector('[data-login-link]')?.addEventListener('click', () => {
    localStorage.removeItem('medimama-current-session');
});

// ===============================
// UPDATE PAGE CONTENT
// ===============================

function updateContent(pageTitle) {
    const topBar = document.querySelector('.top-bar h1');
    const content = document.querySelector('.content');

    if (topBar) {
        topBar.textContent = pageTitle;
    }

    if (content) {
        content.innerHTML = `<p>You are now viewing: <strong>${pageTitle}</strong></p>`;
    }
}

// ===============================
// SET FIRST MENU AS ACTIVE
// ===============================

// ===============================
// KEYBOARD SHORTCUTS
// ===============================

document.addEventListener('keydown', (e) => {
    // Close submenu on Escape
    if (e.key === 'Escape') {
        menuItems.forEach(item => {
            item.classList.remove('open');
            const submenu = item.querySelector('.submenu');
            if (submenu) {
                submenu.classList.remove('open');
            }
        });
        if (profileItem && profileLink) {
            profileItem.classList.remove('open');
            profileLink.setAttribute('aria-expanded', 'false');
        }
    }

    // Toggle sidebar with Ctrl + B
    if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
    }
});

// ===============================
// RESPONSIVE HANDLING
// ===============================

