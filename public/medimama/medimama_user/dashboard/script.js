const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalKicker = document.getElementById('modalKicker');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
const toast = document.getElementById('toast');
const notificationButton = document.getElementById('notificationButton');
const notificationMenu = document.getElementById('notificationMenu');
const growthToggle = document.getElementById('growthToggle');
const growthChart = document.getElementById('growthChart');
const tips = [...document.querySelectorAll('.tip')];
const tipDots = document.getElementById('tipDots');
let activeTip = 0;
let toastTimer;

document.getElementById('motherLogout')?.addEventListener('click', () => {
    localStorage.removeItem('medimama-current-session');
    window.location.href = '../../medimama_admin/medimamaloginandsignup/medimamalogin.html';
});

const modalViews = {
    appointmentDetails: {
        kicker: 'Appointment',
        title: 'Prenatal Checkup',
        body: `
            <div class="detail-list">
                <div class="detail-row"><i class="fa-regular fa-calendar-days"></i><span><strong>August 20, 2026</strong><small>Thursday, 8:30 AM</small></span><b class="status-pill">Confirmed</b></div>
                <div class="detail-row"><i class="fa-solid fa-user-nurse"></i><span><strong>Midwife Maria</strong><small>Assigned provider</small></span><b class="status-pill">Available</b></div>
                <div class="detail-row"><i class="fa-solid fa-location-dot"></i><span><strong>Barangay Health Center</strong><small>Bring your maternal record and valid ID.</small></span><b class="status-pill">Clinic 1</b></div>
            </div>`
    },
    immunizationSchedule: {
        kicker: 'Baby Care',
        title: 'Immunization Schedule',
        body: `
            <div class="record-list">
                <div class="record-row"><i class="fa-solid fa-circle-check"></i><span><strong>BCG</strong><small>Given at birth</small></span><b class="status-pill">Completed</b></div>
                <div class="record-row"><i class="fa-solid fa-circle-check"></i><span><strong>Hepatitis B</strong><small>Given at birth</small></span><b class="status-pill">Completed</b></div>
                <div class="record-row"><i class="fa-solid fa-syringe"></i><span><strong>Pentavalent 1</strong><small>Due on August 28, 2026</small></span><b class="status-pill">Upcoming</b></div>
                <div class="record-row"><i class="fa-solid fa-syringe"></i><span><strong>OPV 1 and PCV 1</strong><small>Recommended with the 6-week dose</small></span><b class="status-pill">Pending</b></div>
            </div>`
    },
    healthRecords: {
        kicker: 'Records',
        title: 'Health Records',
        body: `
            <div class="record-list">
                <div class="record-row"><i class="fa-solid fa-person-pregnant"></i><span><strong>Maternal Record</strong><small>Blood pressure normal, next prenatal visit scheduled.</small></span><b class="status-pill">Updated</b></div>
                <div class="record-row"><i class="fa-solid fa-baby"></i><span><strong>Infant Growth</strong><small>5.2 kg weight, 58 cm height.</small></span><b class="status-pill">Normal</b></div>
                <div class="record-row"><i class="fa-solid fa-file-medical"></i><span><strong>Lab and Ultrasound</strong><small>No new uploaded result yet.</small></span><b class="status-pill">Open</b></div>
            </div>`
    },
    facilityLocator: {
        kicker: 'Services',
        title: 'Nearby Healthcare Facilities',
        body: `
            <div class="detail-list">
                <div class="detail-row"><i class="fa-regular fa-hospital"></i><span><strong>Barangay Health Center</strong><small>0.8 km away, open 8:00 AM to 5:00 PM</small></span><b class="status-pill">Open</b></div>
                <div class="detail-row"><i class="fa-solid fa-house-medical"></i><span><strong>Imus City Health Office</strong><small>4.2 km away, maternal and infant services available.</small></span><b class="status-pill">Open</b></div>
            </div>`
    },
    healthEducation: {
        kicker: 'Health Education',
        title: 'Recommended Guides',
        body: `
            <div class="record-list">
                <div class="record-row"><i class="fa-solid fa-person-breastfeeding"></i><span><strong>Breastfeeding Guide</strong><small>Feeding positions, latch support, and milk supply reminders.</small></span><b class="status-pill">Read</b></div>
                <div class="record-row"><i class="fa-solid fa-bowl-food"></i><span><strong>Nutrition for Mothers</strong><small>Iron, folic acid, calcium, and hydration tips.</small></span><b class="status-pill">New</b></div>
                <div class="record-row"><i class="fa-solid fa-shield-heart"></i><span><strong>Newborn Care</strong><small>Danger signs, temperature checks, and safe sleeping.</small></span><b class="status-pill">Saved</b></div>
            </div>`
    },
    announcementDetails: {
        kicker: 'Barangay Announcement',
        title: 'No Clinic Operation',
        body: `
            <div class="detail-list">
                <div class="detail-row"><i class="fa-solid fa-bullhorn"></i><span><strong>August 22, 2026</strong><small>The barangay clinic is closed due to Barangay Assembly.</small></span><b class="status-pill">Notice</b></div>
                <div class="detail-row"><i class="fa-solid fa-phone"></i><span><strong>Emergency contact</strong><small>For urgent maternal or infant concerns, contact the barangay health center hotline.</small></span><b class="status-pill">Available</b></div>
            </div>`
    },
    profileDetails: {
        kicker: 'Profile',
        title: 'Shaina Santos',
        body: `
            <div class="detail-list">
                <div class="detail-row"><i class="fa-solid fa-user"></i><span><strong>Mother Account</strong><small>Barangay Bucandala II, Imus City, Cavite</small></span><b class="status-pill">Active</b></div>
                <div class="detail-row"><i class="fa-solid fa-heart-pulse"></i><span><strong>Motherhood status</strong><small>Postpartum &middot; Baby Patrick was born on June 15, 2026.</small></span><b class="status-pill">Baby born</b></div>
                <div class="detail-row"><i class="fa-solid fa-baby"></i><span><strong>Baby Patrick Ibanez</strong><small>2 months old / Male</small></span><b class="status-pill">Linked</b></div>
                <div class="detail-row"><i class="fa-solid fa-phone"></i><span><strong>Contact</strong><small>0917 555 2026</small></span><b class="status-pill">Verified</b></div>
            </div>
            <div class="profile-actions">
                <button class="secondary" type="button" data-action="logout">Logout</button>
            </div>`
    }
};

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function openModal(view) {
    if (view === 'bookAppointment') {
        renderBookAppointment();
        return;
    }
    if (view === 'healthReport') {
        renderHealthReport();
        return;
    }
    if (view === 'assistantChat') {
        renderAssistant();
        return;
    }

    const content = modalViews[view];
    if (!content) return;
    modalKicker.textContent = content.kicker;
    modalTitle.textContent = content.title;
    modalBody.innerHTML = content.body;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modalClose.focus();
}

function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
}

function renderBookAppointment() {
    modalKicker.textContent = 'Appointments';
    modalTitle.textContent = 'Book Appointment';
    modalBody.innerHTML = `
        <form class="modal-form" id="appointmentForm">
            <label>Service Type
                <select required>
                    <option value="">Select service</option>
                    <option>Prenatal Checkup</option>
                    <option>Postnatal Checkup</option>
                    <option>Infant Immunization</option>
                    <option>Follow-up Consultation</option>
                </select>
            </label>
            <label>Preferred Date
                <input type="date" required>
            </label>
            <label>Preferred Time
                <select required>
                    <option value="">Select time slot</option>
                    <option>8:30 AM</option>
                    <option>10:00 AM</option>
                    <option>1:30 PM</option>
                    <option>3:00 PM</option>
                </select>
            </label>
            <label>Notes
                <textarea placeholder="Optional notes for the health worker"></textarea>
            </label>
            <div class="form-actions"><button class="secondary" type="button" data-close-modal>Cancel</button><button type="submit">Submit Request</button></div>
        </form>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function renderHealthReport() {
    modalKicker.textContent = 'Health Concern';
    modalTitle.textContent = 'Report Health Concern';
    modalBody.innerHTML = `
        <form class="modal-form" id="reportForm">
            <label>Concern For
                <select required>
                    <option>Mother</option>
                    <option>Baby</option>
                </select>
            </label>
            <label>Concern Type
                <select required>
                    <option>Fever</option>
                    <option>Bleeding</option>
                    <option>Feeding concern</option>
                    <option>Medication question</option>
                    <option>Other</option>
                </select>
            </label>
            <label>Describe the concern
                <textarea required placeholder="Describe symptoms, start time, and any medicine taken"></textarea>
            </label>
            <div class="form-actions"><button class="secondary" type="button" data-close-modal>Cancel</button><button type="submit">Send Report</button></div>
        </form>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function renderAssistant() {
    modalKicker.textContent = 'MediMama Assistant';
    modalTitle.textContent = 'Chat Support';
    modalBody.innerHTML = `
        <div class="assistant-box">
            <div class="chat-log" id="chatLog">
                <div class="message">Hi Shaina. You can ask about appointments, vaccines, breastfeeding, or danger signs.</div>
            </div>
            <form class="chat-form" id="chatForm">
                <input type="text" placeholder="Type your question" required>
                <button type="submit"><i class="fa-solid fa-paper-plane"></i></button>
            </form>
        </div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function renderTips() {
    if (!tips.length || !tipDots) return;
    tips.forEach((tip, index) => tip.classList.toggle('active', index === activeTip));
    if (!tipDots.children.length) {
        tips.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('aria-label', `Show health tip ${index + 1}`);
            dot.addEventListener('click', () => {
                activeTip = index;
                renderTips();
            });
            tipDots.appendChild(dot);
        });
    }
    [...tipDots.children].forEach((dot, index) => dot.classList.toggle('active', index === activeTip));
}

document.querySelectorAll('[data-open]').forEach(button => {
    button.addEventListener('click', () => {
        notificationMenu?.classList.remove('open');
        notificationButton?.setAttribute('aria-expanded', 'false');
        openModal(button.dataset.open);
    });
});

document.querySelectorAll('[data-nav]').forEach(button => {
    button.addEventListener('click', event => {
        event.preventDefault();
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        if (button.classList.contains('nav-link')) button.classList.add('active');
        const label = button.textContent.trim() || 'Home';
        if (button.dataset.nav !== 'home') openModal(button.dataset.nav === 'appointments' ? 'bookAppointment' : button.dataset.nav === 'records' ? 'healthRecords' : 'facilityLocator');
        showToast(`${label} selected`);
    });
});

notificationButton?.addEventListener('click', () => {
    const isOpen = notificationMenu.classList.toggle('open');
    notificationButton.setAttribute('aria-expanded', String(isOpen));
});

document.addEventListener('click', event => {
    if (!event.target.closest('.notification-wrap')) {
        notificationMenu?.classList.remove('open');
        notificationButton?.setAttribute('aria-expanded', 'false');
    }
});

document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', () => showToast('All notifications opened'));
});

document.querySelectorAll('[data-slide]').forEach(button => {
    button.addEventListener('click', () => {
        activeTip = button.dataset.slide === 'next'
            ? (activeTip + 1) % tips.length
            : (activeTip - 1 + tips.length) % tips.length;
        renderTips();
    });
});

growthToggle?.addEventListener('click', () => {
    const isHidden = growthChart.hidden;
    growthChart.hidden = !isHidden;
    growthToggle.textContent = isHidden ? 'Hide chart' : 'View full chart';
});

modalBody?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'appointmentForm') showToast('Appointment request submitted for review.');
    if (form.id === 'reportForm') showToast('Health concern report sent to the barangay health worker.');
    if (form.id === 'chatForm') {
        const input = form.querySelector('input');
        const chatLog = form.closest('.assistant-box').querySelector('#chatLog');
        chatLog.insertAdjacentHTML('beforeend', `<div class="message user">${input.value}</div>`);
        chatLog.insertAdjacentHTML('beforeend', '<div class="message">Thank you. For urgent symptoms like heavy bleeding, difficulty breathing, seizure, or high fever, contact your health center immediately.</div>');
        input.value = '';
        chatLog.scrollTop = chatLog.scrollHeight;
        return;
    }
    closeModal();
});

modalBody?.addEventListener('click', event => {
    if (event.target.closest('[data-close-modal]')) {
        closeModal();
        return;
    }
    if (event.target.closest('[data-action="logout"]')) {
        const confirmed = window.confirm('Are you sure you want to logout?');
        if (confirmed) {
            closeModal();
            showToast('You have been logged out.');
            // If you want to redirect to a login page, uncomment and update the line below
            // window.location.href = '../login/medimamalogin.html';
        }
    }
});

modalClose?.addEventListener('click', closeModal);
modal?.addEventListener('click', event => {
    if (event.target === modal) closeModal();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
});

function setupAppointmentPage() {
    const filterButtons = document.querySelectorAll('.appointments-page .pill');
    const appointmentRows = document.querySelectorAll('.appointments-list .appointment-row');

    if (!filterButtons.length || !appointmentRows.length) return;

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const filter = button.dataset.filter;
            appointmentRows.forEach(row => {
                const status = row.dataset.status;
                row.style.display = filter === 'all' || status === filter ? '' : 'none';
            });
        });
    });

    document.querySelector('.appointments-list')?.addEventListener('click', event => {
        const button = event.target.closest('.appointment-row button');
        if (!button) return;
        const row = button.closest('.appointment-row');
        appointmentRows.forEach(item => item.classList.remove('selected'));
        row?.classList.add('selected');
    });
}

setupAppointmentPage();
setupRecordsPage();
renderTips();

function setupInfantPage() {
    const registrationPanel = document.getElementById('registrationPanel');
    const registrationForm = document.getElementById('infantRegistrationForm');
    const openButtons = [document.getElementById('showInfantRegistration'), document.getElementById('approvalRegister')];
    const closeButtons = [document.getElementById('hideInfantRegistration'), document.getElementById('cancelInfantRegistration')];
    const infantSelector = document.getElementById('infantSelector');

    if (!registrationPanel) return;

    const openRegistration = () => {
        registrationPanel.hidden = false;
        registrationPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        registrationPanel.querySelector('input')?.focus({ preventScroll: true });
    };
    openButtons.forEach(button => button?.addEventListener('click', openRegistration));
    closeButtons.forEach(button => button?.addEventListener('click', () => { registrationPanel.hidden = true; }));

    registrationForm?.addEventListener('submit', event => {
        event.preventDefault();
        const name = new FormData(registrationForm).get('infantName');
        try {
            const requests = JSON.parse(localStorage.getItem('medimama-pending-approvals')) || [];
            let session = {};
            try { session = JSON.parse(localStorage.getItem('medimama-current-session')) || {}; } catch { session = {}; }
            requests.unshift({
                id: `approval-infant-${Date.now()}`,
                name: `Baby ${name}`,
                type: 'Infant',
                details: `Infant registration · Submitted by ${session.name || 'mother account'}`,
                submitted: new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
                accountId: session.id || null
            });
            localStorage.setItem('medimama-pending-approvals', JSON.stringify(requests));
        } catch (error) {
            console.warn('Unable to save the infant registration locally.', error);
        }
        registrationPanel.hidden = true;
        registrationForm.reset();
        const approvalCard = document.getElementById('approvalCard');
        if (approvalCard) {
            approvalCard.innerHTML = `<span class="approval-icon"><i class="fa-regular fa-clock"></i></span><div><p class="label">Registration status</p><h2>${name} is pending approval</h2><p>Your request has been sent to the barangay health worker. Growth records and the vaccine checklist will appear once the infant is approved.</p></div>`;
        }
        showToast('Infant registration submitted for admin approval.');
    });

    infantSelector?.addEventListener('change', () => {
        // This selector is ready for additional approved infants from the database.
        showToast(`${infantSelector.options[infantSelector.selectedIndex].text} selected`);
    });
}

setupInfantPage();

function renderRecordDetails(record) {
    modalKicker.textContent = 'Health Record';
    modalTitle.textContent = `${record.type} • ${record.statusLabel}`;
    modalBody.innerHTML = `
        <div class="detail-list">
            <div class="detail-row"><i class="fa-solid fa-file-medical"></i><span><strong>${record.type}</strong><small>${record.details}</small></span><b class="status-pill">${record.statusLabel}</b></div>
            <div class="detail-row"><i class="fa-regular fa-calendar-days"></i><span><strong>${record.date}</strong><small>Record date</small></span></div>
            <div class="detail-row"><i class="fa-solid fa-clock"></i><span><strong>Record access</strong><small>Tap any row to see details in this modal.</small></span></div>
        </div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modalClose.focus();
}

function setupRecordsPage() {
    const searchInput = document.getElementById('recordSearch');
    const filterButtons = document.querySelectorAll('.records-toolbar .pill');
    const recordRows = [...document.querySelectorAll('.records-table tbody tr.clickable-row')];

    if (!searchInput || !filterButtons.length || !recordRows.length) return;

    function applyRecordFilter() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const activeFilter = document.querySelector('.records-toolbar .pill.active')?.dataset.filter || 'all';
        let visibleCount = 0;

        recordRows.forEach(row => {
            const type = row.dataset.recordType.toLowerCase();
            const details = row.dataset.recordDetails.toLowerCase();
            const date = row.dataset.recordDate.toLowerCase();
            const status = row.dataset.recordStatus.toLowerCase();
            const matchesSearch = [type, details, date].some(value => value.includes(searchTerm));
            const matchesFilter = activeFilter === 'all' || status === activeFilter;
            const visible = matchesSearch && matchesFilter;
            row.style.display = visible ? '' : 'none';
            if (visible) visibleCount += 1;
        });

        const noResultsRow = document.querySelector('.records-table tbody tr.no-results');
        if (visibleCount === 0) {
            if (!noResultsRow) {
                const row = document.createElement('tr');
                row.classList.add('no-results');
                row.innerHTML = '<td colspan="4">No matching records found.</td>';
                document.querySelector('.records-table tbody').appendChild(row);
            }
        } else if (noResultsRow) {
            noResultsRow.remove();
        }
    }

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            applyRecordFilter();
        });
    });

    searchInput.addEventListener('input', applyRecordFilter);

    recordRows.forEach(row => {
        row.addEventListener('click', () => {
            const record = {
                type: row.dataset.recordType,
                details: row.dataset.recordDetails,
                date: row.dataset.recordDate,
                statusLabel: row.dataset.recordStatusLabel || row.dataset.recordStatus,
            };
            renderRecordDetails(record);
        });
    });
}
