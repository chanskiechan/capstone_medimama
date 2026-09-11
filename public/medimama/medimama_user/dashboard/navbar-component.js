/* Shared navigation for the mother dashboard pages. */
(function renderMotherNavbar() {
    const mount = document.querySelector('[data-medimama-mother-navbar]');
    if (!mount) return;

    const currentPage = window.location.pathname.split('/').pop().toLowerCase() || 'userdashboard.html';
    const isActive = page => currentPage === page ? ' active' : '';
    let session = {};
    try { session = JSON.parse(localStorage.getItem('medimama-current-session')) || {}; } catch { session = {}; }
    const displayName = session.role === 'mother' && session.name ? session.name : 'Shaina Santos';
    const initials = displayName.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();

    mount.innerHTML = `
        <header class="app-header">
            <a class="brand" href="userdashboard.html" aria-label="MediMama home">
                <img src="../../medimamalogo.png" alt="MediMama logo">
            </a>
            <nav class="main-nav" aria-label="Main navigation">
                <a class="nav-link${isActive('userdashboard.html')}" href="userdashboard.html"><i class="fa-solid fa-house"></i><span>Home</span></a>
                <a class="nav-link${isActive('appointments.html')}" href="appointments.html"><i class="fa-regular fa-calendar-days"></i><span>Appointments</span></a>
                <a class="nav-link${isActive('records.html')}" href="records.html"><i class="fa-regular fa-clipboard"></i><span>Records</span></a>
                <a class="nav-link${isActive('infants.html')}" href="infants.html"><i class="fa-solid fa-baby"></i><span>My Infants</span></a>
                <button class="nav-link" type="button" data-open="facilityLocator"><i class="fa-solid fa-hand-holding-heart"></i><span>Services</span></button>
            </nav>
            <div class="header-actions">
                <div class="notification-wrap">
                    <button class="icon-button" type="button" id="notificationButton" aria-label="Open notifications" aria-expanded="false"><i class="fa-regular fa-bell"></i><b>3</b></button>
                    <div class="notification-menu" id="notificationMenu" role="menu">
                        <div class="mini-heading"><strong>Notifications</strong><button type="button" data-action="view-notifications">View all</button></div>
                        <button type="button" data-open="appointmentDetails"><span class="round pink"><i class="fa-regular fa-calendar-days"></i></span><span><strong>Appointment Reminder</strong><small>You have an appointment on August 20, 2026 at 8:30 AM.</small></span></button>
                        <button type="button" data-open="immunizationSchedule"><span class="round blue"><i class="fa-solid fa-syringe"></i></span><span><strong>Immunization Reminder</strong><small>Pentavalent 1 vaccine is due on August 28, 2026.</small></span></button>
                        <button type="button" data-open="announcementDetails"><span class="round lavender"><i class="fa-solid fa-bullhorn"></i></span><span><strong>New Announcement</strong><small>No clinic operation on August 22, 2026.</small></span></button>
                    </div>
                </div>
                <button class="user-pill" type="button" data-open="profileDetails"><span class="avatar">${initials}</span><span><strong>${displayName}</strong><small>Mother</small></span></button>
                <button class="icon-button" type="button" id="motherLogout" aria-label="Log out"><i class="fa-solid fa-right-from-bracket"></i></button>
            </div>
        </header>`;
}());
