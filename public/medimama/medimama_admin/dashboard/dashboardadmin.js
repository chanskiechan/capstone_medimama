const currentDate = document.getElementById('currentDate');

if (currentDate) {
    currentDate.textContent = new Intl.DateTimeFormat('en-PH', {
        month: 'long', day: 'numeric', year: 'numeric'
    }).format(new Date());
}

const notificationButton = document.getElementById('notificationButton');
const notificationMenu = document.getElementById('notificationMenu');
const dashboardToast = document.getElementById('dashboardToast');
const dataModal = document.getElementById('dataModal');
const modalTitle = document.getElementById('dataModalTitle');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const approvalTypeFilter = document.getElementById('approvalTypeFilter');
let toastTimer;

function showToast(message) {
    if (!dashboardToast) return;
    dashboardToast.textContent = message;
    dashboardToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dashboardToast.classList.remove('show'), 2600);
}

if (notificationButton && notificationMenu) {
    notificationButton.addEventListener('click', () => {
        const isOpen = notificationMenu.classList.toggle('open');
        notificationButton.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.notification-menu-wrap')) {
            notificationMenu.classList.remove('open');
            notificationButton.setAttribute('aria-expanded', 'false');
        }
    });
}

const motherProfiles = {
    ana: {
        name: 'Ana Reyes', initials: 'AR', id: 'M-2025-0148', age: '27 years old', contact: '0917 555 0148', address: 'Purok 3, San Isidro', bloodType: 'O+', status: 'Postnatal care', infant: 'sofia',
        upcoming: [['June 3, 2025', '9:00 AM', 'Postnatal Checkup', 'Scheduled'], ['June 17, 2025', '9:00 AM', 'Family Planning Consultation', 'Scheduled']],
        history: [['May 20, 2025', 'Postnatal Checkup', 'Normal recovery; breastfeeding support given.', 'Completed'], ['April 8, 2025', 'Delivery Follow-up', 'Healthy delivery recorded at birthing center.', 'Completed'], ['March 25, 2025', 'Prenatal Checkup', 'BP 110/70; no danger signs reported.', 'Completed']],
        reports: [['May 20, 2025', 'Postnatal assessment', 'No concerns; mother and baby stable.', 'Filed'], ['April 8, 2025', 'Delivery report', 'Normal spontaneous delivery.', 'Filed']]
    },
    liza: {
        name: 'Liza Dela Cruz', initials: 'LD', id: 'M-2025-0152', age: '31 years old', contact: '0918 555 0152', address: 'Purok 5, San Isidro', bloodType: 'A+', status: '3rd trimester', infant: null,
        upcoming: [['May 30, 2025', '9:30 AM', 'Prenatal Checkup', 'Scheduled'], ['June 13, 2025', '10:00 AM', 'Prenatal Checkup', 'Scheduled']],
        history: [['May 16, 2025', 'Prenatal Checkup', 'BP 112/72; fetal heart rate normal.', 'Completed'], ['May 2, 2025', 'Laboratory Review', 'Routine laboratory results reviewed.', 'Completed']],
        reports: [['May 16, 2025', 'Prenatal assessment', 'No warning signs; advised on birth preparedness.', 'Filed']]
    },
    maria: {
        name: 'Maria Gonzales', initials: 'MG', id: 'M-2025-0126', age: '24 years old', contact: '0917 555 0126', address: 'Purok 2, San Isidro', bloodType: 'B+', status: 'Postnatal care', infant: 'liam',
        upcoming: [['May 27, 2025', '11:00 AM', 'Postnatal Checkup', 'Scheduled']],
        history: [['May 13, 2025', 'Postnatal Checkup', 'Healing well; nutrition counselling provided.', 'Completed'], ['April 15, 2025', 'Delivery Follow-up', 'Mother stable after delivery.', 'Completed']],
        reports: [['May 13, 2025', 'Postnatal assessment', 'No complications noted.', 'Filed']]
    },
    leah: {
        name: 'Leah Cruz', initials: 'LC', id: 'M-2025-0109', age: '26 years old', contact: '0917 555 0109', address: 'Purok 1, San Isidro', bloodType: 'O+', status: 'Postnatal care', infant: 'ethan',
        upcoming: [['June 5, 2025', '1:30 PM', 'Postnatal Checkup', 'Scheduled']],
        history: [['May 10, 2025', 'Postnatal Checkup', 'Mother recovering well; infant feeding reviewed.', 'Completed']],
        reports: [['May 10, 2025', 'Postnatal assessment', 'No active maternal concerns.', 'Filed']]
    }
};

const infantProfiles = {
    sofia: { name: 'Baby Sofia Reyes', initials: 'SR', id: 'I-2025-0041', age: '2 months old', sex: 'Female', birthDate: 'March 18, 2025', bloodType: 'O+', mother: 'ana', status: 'Active', upcoming: [['June 3, 2025', '10:00 AM', 'Growth Monitoring', 'Scheduled'], ['June 17, 2025', '9:30 AM', 'Pentavalent 1', 'Scheduled']], history: [['May 20, 2025', 'Newborn Follow-up', 'Weight 4.8 kg; exclusively breastfed.', 'Completed'], ['April 18, 2025', 'BCG & Hepatitis B', 'Vaccines administered; no adverse reaction.', 'Completed']], records: [['May 20, 2025', 'Growth record', 'Weight: 4.8 kg · Length: 55 cm', 'Updated'], ['April 18, 2025', 'Immunization record', 'BCG and Hepatitis B completed', 'Updated']] },
    liam: { name: 'Baby Liam Garcia', initials: 'LG', id: 'I-2024-0087', age: '7 months old', sex: 'Male', birthDate: 'October 9, 2024', bloodType: 'B+', mother: 'maria', status: 'Active', upcoming: [['June 4, 2025', '10:30 AM', 'OPV 3 Immunization', 'Scheduled']], history: [['May 21, 2025', 'Growth Monitoring', 'Weight 7.6 kg; developmental milestones appropriate.', 'Completed'], ['May 14, 2025', 'Fever Follow-up', 'Recovered; cleared for next immunization.', 'Completed']], records: [['May 21, 2025', 'Growth record', 'Weight: 7.6 kg · Length: 67 cm', 'Updated'], ['May 14, 2025', 'Health concern report', 'Fever after vaccination resolved.', 'Resolved']] },
    ethan: { name: 'Baby Ethan Cruz', initials: 'EC', id: 'I-2025-0029', age: '4 months old', sex: 'Male', birthDate: 'January 26, 2025', bloodType: 'O+', mother: 'leah', status: 'Needs follow-up', upcoming: [['May 28, 2025', '2:00 PM', 'Post-vaccination Follow-up', 'Scheduled'], ['June 11, 2025', '9:00 AM', 'Pentavalent 2', 'Scheduled']], history: [['May 24, 2025', 'Pentavalent 1', 'Mild fever reported after vaccination.', 'Completed'], ['May 10, 2025', 'Growth Monitoring', 'Weight 6.2 kg; feeding well.', 'Completed']], records: [['May 26, 2025', 'Health concern report', 'Post-vaccination reaction under review.', 'Pending'], ['May 10, 2025', 'Growth record', 'Weight: 6.2 kg · Length: 61 cm', 'Updated']] }
};

const appointmentTypes = {
    prenatal: { label: 'Prenatal Checkups', description: 'Scheduled care for pregnant mothers', icon: 'fa-person-pregnant' },
    postnatal: { label: 'Postnatal Checkups', description: 'Care for mothers after delivery', icon: 'fa-heart-pulse' },
    immunization: { label: 'Infant Immunizations', description: 'Vaccines and infant follow-up visits', icon: 'fa-syringe' }
};

const appointments = [
    { id: 'apt-001', type: 'prenatal', date: 'May 30, 2025', time: '9:30 AM', service: 'Prenatal Checkup', person: 'Liza Dela Cruz', profileKind: 'mother', profileId: 'liza', attendance: 'Scheduled' },
    { id: 'apt-002', type: 'postnatal', date: 'May 27, 2025', time: '11:00 AM', service: 'Postnatal Checkup', person: 'Maria Gonzales', profileKind: 'mother', profileId: 'maria', attendance: 'Scheduled' },
    { id: 'apt-003', type: 'postnatal', date: 'June 3, 2025', time: '9:00 AM', service: 'Postnatal Checkup', person: 'Ana Reyes', profileKind: 'mother', profileId: 'ana', attendance: 'Scheduled' },
    { id: 'apt-004', type: 'postnatal', date: 'June 5, 2025', time: '1:30 PM', service: 'Postnatal Checkup', person: 'Leah Cruz', profileKind: 'mother', profileId: 'leah', attendance: 'Scheduled' },
    { id: 'apt-005', type: 'immunization', date: 'May 28, 2025', time: '2:00 PM', service: 'Post-vaccination Follow-up', person: 'Baby Ethan Cruz', profileKind: 'infant', profileId: 'ethan', attendance: 'Scheduled' },
    { id: 'apt-006', type: 'immunization', date: 'June 4, 2025', time: '10:30 AM', service: 'OPV 3 Immunization', person: 'Baby Liam Garcia', profileKind: 'infant', profileId: 'liam', attendance: 'Scheduled' },
    { id: 'apt-007', type: 'immunization', date: 'June 17, 2025', time: '9:30 AM', service: 'Pentavalent 1', person: 'Baby Sofia Reyes', profileKind: 'infant', profileId: 'sofia', attendance: 'Scheduled' }
];

const dashboardStateKey = 'medimama-dashboard-demo-state';
const pendingApprovalKey = 'medimama-pending-approvals';
let auditTrail = [];
let pendingApprovals = [];

const defaultPendingApprovals = [
    { id: 'approval-mother-001', name: 'Liza Dela Cruz', type: 'Mother', details: 'Maternal account registration', submitted: 'May 27, 2025', profileKind: 'mother', profileId: 'liza' },
    { id: 'approval-infant-001', name: 'Baby Ethan Cruz', type: 'Infant', details: 'Infant record · Mother: Leah Cruz', submitted: 'May 26, 2025', profileKind: 'infant', profileId: 'ethan' },
    { id: 'approval-caregiver-001', name: 'Juan Cruz', type: 'Caregiver', details: 'Father · linked to Baby Ethan Cruz', submitted: 'May 26, 2025', profileKind: 'infant', profileId: 'ethan' }
];

function restorePendingApprovals() {
    try {
        pendingApprovals = JSON.parse(localStorage.getItem(pendingApprovalKey)) || defaultPendingApprovals;
    } catch (error) {
        pendingApprovals = defaultPendingApprovals;
    }
}

function savePendingApprovals() {
    localStorage.setItem(pendingApprovalKey, JSON.stringify(pendingApprovals));
}

function updateApprovalSummary() {
    const count = document.getElementById('pendingApprovalCount');
    if (count) count.textContent = pendingApprovals.length;
    renderDashboardApprovalList();
}

function renderDashboardApprovalList() {
    const list = document.getElementById('dashboardApprovalList');
    if (!list) return;
    const selectedType = approvalTypeFilter?.value || 'all';
    const filteredApprovals = selectedType === 'all'
        ? pendingApprovals
        : pendingApprovals.filter(item => item.type === selectedType);
    if (!filteredApprovals.length) {
        list.innerHTML = `<p class="dashboard-approval-empty"><i class="fa-solid fa-circle-check"></i> No pending ${selectedType === 'all' ? '' : selectedType.toLowerCase() + ' '}registration requests.</p>`;
        return;
    }
    list.innerHTML = filteredApprovals.map(item => `<button type="button" class="dashboard-approval-row" data-modal="approvals"><span class="approval-type ${String(item.type).toLowerCase()}">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.details)}</small></span><time>${escapeHtml(item.submitted)}</time><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`).join('');
    list.querySelectorAll('[data-modal="approvals"]').forEach(button => {
        button.addEventListener('click', () => openModal('approvals', button));
    });
}

function approvalContent() {
    if (!pendingApprovals.length) return '<div class="modal-note"><i class="fa-solid fa-circle-check"></i><span>There are no pending registrations to review.</span></div>';
    return `<p>Review the identity, relationship, and linked-patient details before granting access.</p><div class="modal-table approval-table"><div class="modal-table-head"><span>Name</span><span>Type</span><span>Registration details</span><span>Submitted</span><span>Action</span></div>${pendingApprovals.map(item => `<div><span>${item.name}</span><span>${item.type}</span><span>${item.details}</span><span>${item.submitted}</span><span class="approval-actions"><button type="button" class="approval-action approve" data-approval-id="${item.id}" data-approval-action="approved">Approve</button><button type="button" class="approval-action decline" data-approval-id="${item.id}" data-approval-action="declined">Decline</button></span></div>`).join('')}</div>`;
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
}

function caregiverApprovalContent() {
    if (!pendingApprovals.length) return '<div class="modal-note"><i class="fa-solid fa-circle-check"></i><span>There are no pending registrations to review.</span></div>';
    return `<p>For caregiver requests, contact the linked mother first. Approval is enabled only after verification is recorded.</p><div class="modal-table approval-table"><div class="modal-table-head"><span>Name</span><span>Type</span><span>Registration details</span><span>Submitted</span><span>Action</span></div>${pendingApprovals.map(item => {
        const needsMotherVerification = item.type === 'Caregiver' && !item.motherContacted;
        const contactButton = needsMotherVerification ? `<button type="button" class="approval-action verify" data-approval-id="${item.id}" data-approval-action="mother-contacted">Verify with mother</button>` : '';
        const approveDisabled = needsMotherVerification ? 'disabled title="Verify with the mother first"' : '';
        return `<div><span>${escapeHtml(item.name)}<small>${escapeHtml(item.email)}</small></span><span>${escapeHtml(item.type)}</span><span>${escapeHtml(item.details)}</span><span>${escapeHtml(item.submitted)}</span><span class="approval-actions">${contactButton}<button type="button" class="approval-action approve" data-approval-id="${item.id}" data-approval-action="approved" ${approveDisabled}>Approve</button><button type="button" class="approval-action decline" data-approval-id="${item.id}" data-approval-action="declined">Decline</button></span></div>`;
    }).join('')}</div>`;
}

function restoreDashboardState() {
    try {
        const saved = JSON.parse(localStorage.getItem(dashboardStateKey));
        if (!saved) return;
        saved.appointments?.forEach(savedAppointment => {
            const appointment = appointments.find(item => item.id === savedAppointment.id);
            if (appointment) appointment.attendance = savedAppointment.attendance;
        });
        Object.entries(saved.mothers || {}).forEach(([id, history]) => { if (motherProfiles[id]) motherProfiles[id].history = history; });
        Object.entries(saved.infants || {}).forEach(([id, history]) => { if (infantProfiles[id]) infantProfiles[id].history = history; });
        auditTrail = saved.auditTrail || [];
    } catch (error) { console.warn('Unable to restore local dashboard state.', error); }
}

function saveDashboardState() {
    const mothers = Object.fromEntries(Object.entries(motherProfiles).map(([id, profile]) => [id, profile.history]));
    const infants = Object.fromEntries(Object.entries(infantProfiles).map(([id, profile]) => [id, profile.history]));
    localStorage.setItem(dashboardStateKey, JSON.stringify({ appointments, mothers, infants, auditTrail }));
}

function addAuditEntry(message) {
    auditTrail.unshift({ message, time: new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date()) });
    auditTrail = auditTrail.slice(0, 12);
    saveDashboardState();
}

function syncAppointmentRowStatuses() {
    appointments.forEach(appointment => {
        document.querySelectorAll(`.appointment-row[data-appointment-id="${appointment.id}"] b`).forEach(status => {
            status.textContent = appointment.attendance;
            status.classList.toggle('missed-attendance', appointment.attendance === 'Missed');
            status.classList.toggle('attended-attendance', appointment.attendance === 'Attended');
        });
    });
}

restoreDashboardState();
restorePendingApprovals();
syncAppointmentRowStatuses();
updateApprovalSummary();
approvalTypeFilter?.addEventListener('change', renderDashboardApprovalList);

function directoryRow(profile, kind, fields) {
    return `<div>${fields.map(field => `<span>${field}</span>`).join('')}<button type="button" class="details-button" data-profile-kind="${kind}" data-profile-id="${profile}">View details <i class="fa-solid fa-arrow-right"></i></button></div>`;
}

function appointmentRows(rows) {
    return rows.map(row => `<div><span>${row[0]}</span><span>${row[1]}</span><span>${row[2]}</span><b class="blue-status">${row[3]}</b></div>`).join('');
}

function recordRows(rows) {
    return rows.map(row => `<div><span>${row[0]}</span><span>${row[1]}</span><span>${row[2]}</span><b class="${row[3] === 'Missed' ? 'pink-status' : 'ok-status'}">${row[3]}</b></div>`).join('');
}

function appointmentTypeContent(type) {
    const group = appointments.filter(appointment => appointment.type === type);
    const info = appointmentTypes[type];
    return `<p>All ${info.label.toLowerCase()} schedules and the patients expected for each visit.</p><div class="profile-table type-appointment-table"><div class="profile-table-head"><span>Date</span><span>Time</span><span>Patient</span><span>Appointment</span><span></span></div>${group.map(appointment => `<div><span>${appointment.date}</span><span>${appointment.time}</span><span>${appointment.person}</span><span>${appointment.service}</span><button type="button" class="details-button" data-appointment-id="${appointment.id}">View <i class="fa-solid fa-arrow-right"></i></button></div>`).join('')}</div>`;
}

function appointmentDetailContent(appointment) {
    const type = appointmentTypes[appointment.type];
    const done = appointment.attendance !== 'Scheduled';
    return `<section class="appointment-detail"><div class="appointment-type-icon"><i class="fa-solid ${type.icon}"></i></div><div><p class="eyebrow">${type.label}</p><h3>${appointment.service}</h3><p>${appointment.date} · ${appointment.time}</p></div></section><div class="linked-profile"><div><p class="eyebrow">Expected patient</p><strong>${appointment.person}</strong><small>Profile is linked to this appointment</small></div><button type="button" class="details-button" data-profile-kind="${appointment.profileKind}" data-profile-id="${appointment.profileId}">View profile <i class="fa-solid fa-arrow-right"></i></button></div><section class="attendance-panel"><p class="eyebrow">Appointment attendance</p><h3>${done ? `Marked as ${appointment.attendance}` : 'Confirm attendance after the appointment'}</h3>${done ? `<p class="attendance-result ${appointment.attendance === 'Missed' ? 'missed' : ''}"><i class="fa-solid ${appointment.attendance === 'Attended' ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> This result is included in the patient’s health history.</p>` : `<div class="attendance-actions"><button type="button" class="attendance-button attended" data-attendance="Attended" data-appointment-id="${appointment.id}"><i class="fa-solid fa-check"></i> Attended</button><button type="button" class="attendance-button missed" data-attendance="Missed" data-appointment-id="${appointment.id}"><i class="fa-solid fa-xmark"></i> Did not attend</button></div>`}</section>`;
}

function profileContent(profile, kind) {
    const isMother = kind === 'mother';
    const related = isMother ? infantProfiles[profile.infant] : motherProfiles[profile.mother];
    const relatedLabel = isMother ? 'Registered infant' : 'Mother / guardian';
    const relatedDetails = isMother ? `${related.age} · ${related.sex}` : `${related.age} · ${related.contact}`;
    const noRelated = isMother ? '<div class="empty-related"><i class="fa-solid fa-baby"></i><span>No infant profile is linked yet.</span></div>' : '';
    const records = isMother ? profile.reports : profile.records;
    return `<section class="profile-summary"><span class="profile-avatar">${profile.initials}</span><div><p class="eyebrow">${isMother ? 'Maternal profile' : 'Infant profile'} · ${profile.id}</p><h3>${profile.name}</h3><p>${profile.status}</p></div></section>
        <div class="profile-details"><span><small>${isMother ? 'Age' : 'Age / sex'}</small><strong>${isMother ? profile.age : `${profile.age} · ${profile.sex}`}</strong></span><span><small>${isMother ? 'Contact number' : 'Birth date'}</small><strong>${isMother ? profile.contact : profile.birthDate}</strong></span><span><small>Blood type</small><strong>${profile.bloodType}</strong></span><span><small>${isMother ? 'Address' : 'Record status'}</small><strong>${isMother ? profile.address : profile.status}</strong></span></div>
        <section class="linked-profile"><div><p class="eyebrow">${relatedLabel}</p>${related ? `<strong>${related.name}</strong><small>${relatedDetails}</small>` : ''}</div>${related ? `<button type="button" class="details-button" data-profile-kind="${isMother ? 'infant' : 'mother'}" data-profile-id="${isMother ? profile.infant : profile.mother}">View details <i class="fa-solid fa-arrow-right"></i></button>` : ''}${noRelated}</section>
        <section class="profile-section"><h3><i class="fa-regular fa-calendar-check"></i> Upcoming appointments</h3><div class="profile-table appointment-history"><div class="profile-table-head"><span>Date</span><span>Time</span><span>Service</span><span>Status</span></div>${appointmentRows(profile.upcoming)}</div></section>
        <section class="profile-section"><h3><i class="fa-solid fa-clock-rotate-left"></i> Check-up and visit history</h3><div class="profile-table"><div class="profile-table-head"><span>Date</span><span>Visit</span><span>Notes</span><span>Status</span></div>${recordRows(profile.history)}</div></section>
        <section class="profile-section"><h3><i class="fa-solid fa-file-medical"></i> ${isMother ? 'Reports and care records' : 'Health records and reports'}</h3><div class="profile-table"><div class="profile-table-head"><span>Date</span><span>Record</span><span>Details</span><span>Status</span></div>${recordRows(records)}</div></section>`;
}

const modalViews = {
    mothers: {
        title: 'Registered Mothers', subtitle: 'Example patient directory',
        content: `<p>Select a mother to see her full profile, linked infant, appointments, check-up history, and reports.</p><label class="modal-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-directory-search placeholder="Search by name or record ID"></label><div class="modal-table directory-table"><div class="modal-table-head"><span>Name</span><span>Age</span><span>Care status</span><span>Record ID</span><span></span></div>${directoryRow('ana', 'mother', ['Ana Reyes', '27', 'Postnatal care', 'M-2025-0148'])}${directoryRow('liza', 'mother', ['Liza Dela Cruz', '31', '3rd trimester', 'M-2025-0152'])}${directoryRow('maria', 'mother', ['Maria Gonzales', '24', 'Postnatal care', 'M-2025-0126'])}${directoryRow('leah', 'mother', ['Leah Cruz', '26', 'Postnatal care', 'M-2025-0109'])}</div>`
    },
    infants: {
        title: 'Registered Infants', subtitle: 'Example infant directory',
        content: `<p>Select an infant to see their mother, health records, care history, reports, and future appointments.</p><label class="modal-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-directory-search placeholder="Search by infant, mother, or record ID"></label><div class="modal-table directory-table"><div class="modal-table-head"><span>Name</span><span>Age</span><span>Mother</span><span>Record ID</span><span></span></div>${directoryRow('ethan', 'infant', ['Baby Ethan Cruz', '4 months', 'Leah Cruz', 'I-2025-0029'])}${directoryRow('liam', 'infant', ['Baby Liam Garcia', '7 months', 'Maria Gonzales', 'I-2024-0087'])}${directoryRow('sofia', 'infant', ['Baby Sofia Reyes', '2 months', 'Ana Reyes', 'I-2025-0041'])}</div>`
    },
    appointments: {
        title: 'Appointments', subtitle: 'Schedules grouped by type',
        content: `<p>Choose an appointment type to see every schedule and the patients expected to attend.</p><div class="appointment-type-grid">${Object.entries(appointmentTypes).map(([key, type]) => `<button type="button" class="appointment-type-card" data-appointment-type="${key}"><i class="fa-solid ${type.icon}"></i><span><strong>${type.label}</strong><small>${type.description}</small></span><b>${appointments.filter(appointment => appointment.type === key).length} scheduled</b><i class="fa-solid fa-arrow-right arrow"></i></button>`).join('')}</div>`
    },
    followups: {
        title: 'Pending Follow-ups', subtitle: 'Care items that need staff attention',
        content: '<p>Review missed visits, unresolved reports, and patients who need to be contacted.</p><div class="modal-table directory-table"><div class="modal-table-head"><span>Patient</span><span>Follow-up item</span><span>Due date</span><span>Status</span><span></span></div><div><span>Baby Ethan Cruz</span><span>Post-vaccination reaction</span><span>May 28, 2025</span><b class="pink-status">Pending</b><button type="button" class="details-button" data-profile-kind="infant" data-profile-id="ethan">View details <i class="fa-solid fa-arrow-right"></i></button></div><div><span>Liza Dela Cruz</span><span>Prenatal checkup confirmation</span><span>May 30, 2025</span><b class="blue-status">Upcoming</b><button type="button" class="details-button" data-profile-kind="mother" data-profile-id="liza">View details <i class="fa-solid fa-arrow-right"></i></button></div><div><span>Baby Liam Garcia</span><span>OPV 3 appointment</span><span>June 4, 2025</span><b class="pink-status">Needs follow-up</b><button type="button" class="details-button" data-profile-kind="infant" data-profile-id="liam">View details <i class="fa-solid fa-arrow-right"></i></button></div></div>'
    },
    calendar: {
        title: 'Appointment Calendar', subtitle: 'Example May 2025 calendar',
        content: '<p>Blue dates have scheduled appointments. The pink date is selected.</p><div class="calendar-sample"><span>1</span><span>2</span><span class="calendar-event">3</span><span>4</span><span>5</span><span class="calendar-event">6</span><span>7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span><span>13</span><span>14</span><span>15</span><span>16</span><span>17</span><span>18</span><span>19</span><span>20</span><span>21</span><span>22</span><span>23</span><span>24</span><span>25</span><span>26</span><span class="calendar-today">27</span><span class="calendar-event">28</span><span>29</span><span>30</span><span>31</span></div>'
    },
    concerns: {
        title: 'Health Concern Reports', subtitle: 'Example recent concern records',
        content: '<p>Review reports that may require follow-up.</p><div class="modal-table"><div class="modal-table-head"><span>Patient</span><span>Concern</span><span>Reported</span><span>Status</span></div><div><span>Baby Ethan Cruz</span><span>Post-vaccination reaction</span><span>May 26</span><b class="pink-status">Pending</b></div><div><span>Maria Santos</span><span>Maternal health concern</span><span>May 25</span><b class="blue-status">In progress</b></div><div><span>Baby Liam Garcia</span><span>Fever after vaccination</span><span>May 24</span><b class="ok-status">Resolved</b></div></div>'
    },
    activities: {
        title: 'System Activities', subtitle: 'Example activity history',
        content: '<div class="modal-note"><i class="fa-solid fa-circle-info"></i><span>New mother registered: Liza Dela Cruz · 10:15 AM</span></div><div class="modal-note"><i class="fa-solid fa-circle-info"></i><span>Appointment scheduled for Ana Reyes · 9:45 AM</span></div><div class="modal-note"><i class="fa-solid fa-circle-info"></i><span>Immunization record updated for Baby Ethan Cruz · 9:20 AM</span></div>'
    }
};

function openModal(view, trigger) {
    let details = modalViews[view];
    if (view === 'mother-profile') {
        const profile = motherProfiles[trigger.dataset.profileId];
        if (profile) details = { title: profile.name, subtitle: 'Complete maternal care record', content: profileContent(profile, 'mother') };
    }
    if (view === 'infant-profile') {
        const profile = infantProfiles[trigger.dataset.profileId];
        if (profile) details = { title: profile.name, subtitle: 'Complete infant health record', content: profileContent(profile, 'infant') };
    }
    if (view === 'appointment-type') {
        const type = trigger.dataset.appointmentType;
        const info = appointmentTypes[type];
        if (info) details = { title: info.label, subtitle: 'Appointment schedules and expected patients', content: appointmentTypeContent(type) };
    }
    if (view === 'appointment-detail') {
        const appointment = appointments.find(item => item.id === trigger.dataset.appointmentId);
        if (appointment) details = { title: 'Appointment details', subtitle: 'Schedule and attendance status', content: appointmentDetailContent(appointment) };
    }
    if (view === 'activities' && auditTrail.length) {
        details = { title: 'System Activities', subtitle: 'Recent actions saved on this device', content: auditTrail.map(item => `<div class="modal-note"><i class="fa-solid fa-clipboard-check"></i><span>${item.message}<br><small>${item.time}</small></span></div>`).join('') };
    }
    if (view === 'approvals') {
        details = { title: 'Pending Approvals', subtitle: 'Review mother, infant, and caregiver registrations', content: caregiverApprovalContent() };
    }
    if (view === 'appointment') {
        details = { title: 'Appointment Details', subtitle: 'Example appointment record', content: `<div class="modal-note"><i class="fa-regular fa-calendar-check"></i><span><strong>${trigger.dataset.patient}</strong><br>${trigger.dataset.service} at ${trigger.dataset.time}<br>Status: Scheduled</span></div>` };
    }
    if (!details || !dataModal) return;
    modalTitle.textContent = details.title;
    document.getElementById('dataModalSubtitle').textContent = details.subtitle;
    modalContent.innerHTML = details.content;
    dataModal.classList.add('open');
    dataModal.setAttribute('aria-hidden', 'false');
    modalClose.focus();
}

function closeModal() {
    if (!dataModal) return;
    dataModal.classList.remove('open');
    dataModal.setAttribute('aria-hidden', 'true');
}

document.querySelectorAll('[data-modal]').forEach(trigger => {
    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        openModal(trigger.dataset.modal, trigger);
    });
});

modalContent?.addEventListener('click', event => {
    const approvalButton = event.target.closest('[data-approval-action]');
    if (approvalButton) {
        const index = pendingApprovals.findIndex(item => item.id === approvalButton.dataset.approvalId);
        if (index < 0) return;
        const request = pendingApprovals[index];
        const action = approvalButton.dataset.approvalAction;
        if (action === 'mother-contacted') {
            request.motherContacted = true;
            savePendingApprovals();
            addAuditEntry(`Mother verification recorded for caregiver request from ${request.name}.`);
            openModal('approvals', approvalButton);
            showToast(`Mother verification recorded for ${request.name}. You may now approve or decline the request.`);
            return;
        }
        if (action === 'approved' && request.type === 'Caregiver' && !request.motherContacted) return;
        if (request.accountId) {
            try {
                const accounts = JSON.parse(localStorage.getItem('medimama-accounts')) || [];
                const account = accounts.find(item => item.id === request.accountId);
                if (account) {
                    account.status = action === 'approved' ? 'approved' : 'declined';
                    account.reviewedAt = new Date().toISOString();
                    localStorage.setItem('medimama-accounts', JSON.stringify(accounts));
                }
            } catch (error) {
                console.warn('Unable to update the frontend account status.', error);
            }
        }
        pendingApprovals.splice(index, 1);
        savePendingApprovals();
        updateApprovalSummary();
        addAuditEntry(`${request.type} registration for ${request.name} was ${action}. ${request.email ? `A ${action} email is queued for ${request.email}.` : ''}`);
        openModal('approvals', approvalButton);
        showToast(`${request.name} registration ${action}. ${request.email ? 'Email notification queued.' : ''}`);
        return;
    }
    const typeButton = event.target.closest('[data-appointment-type]');
    if (typeButton) {
        openModal('appointment-type', typeButton);
        return;
    }
    const appointmentButton = event.target.closest('[data-appointment-id]');
    if (appointmentButton && !appointmentButton.dataset.attendance) {
        openModal('appointment-detail', appointmentButton);
        return;
    }
    const attendanceButton = event.target.closest('[data-attendance]');
    if (attendanceButton) {
        const appointment = appointments.find(item => item.id === attendanceButton.dataset.appointmentId);
        const profile = appointment?.profileKind === 'mother' ? motherProfiles[appointment.profileId] : infantProfiles[appointment?.profileId];
        if (!appointment || !profile) return;
        appointment.attendance = attendanceButton.dataset.attendance;
        const note = appointment.attendance === 'Attended' ? 'Patient attended as scheduled.' : 'Patient did not attend the scheduled appointment.';
        profile.history.unshift([appointment.date, appointment.service, note, appointment.attendance]);
        syncAppointmentRowStatuses();
        addAuditEntry(`${appointment.person} marked as ${appointment.attendance.toLowerCase()} for ${appointment.service}.`);
        openModal('appointment-detail', attendanceButton);
        showToast(`${appointment.person} marked as ${appointment.attendance.toLowerCase()}. Profile history updated.`);
        return;
    }
    const button = event.target.closest('[data-profile-kind]');
    if (!button) return;
    openModal(button.dataset.profileKind === 'mother' ? 'mother-profile' : 'infant-profile', button);
});

modalContent?.addEventListener('input', event => {
    const search = event.target.closest('[data-directory-search]');
    if (!search) return;
    const query = search.value.trim().toLowerCase();
    modalContent.querySelectorAll('.directory-table > div:not(.modal-table-head)').forEach(row => {
        row.hidden = !row.textContent.toLowerCase().includes(query);
    });
});

modalClose?.addEventListener('click', closeModal);
dataModal?.addEventListener('click', event => { if (event.target === dataModal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

document.querySelectorAll('.dashboard-page a[href="#"]:not([data-modal])').forEach(link => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        showToast(`${link.textContent.trim()} selected`);
    });
});

document.querySelectorAll('[data-action], [data-notice]').forEach(button => {
    button.addEventListener('click', () => {
        showToast(button.dataset.action || button.dataset.notice);
        notificationMenu?.classList.remove('open');
        notificationButton?.setAttribute('aria-expanded', 'false');
    });
});

// Shared record-store summary. Legacy modal examples remain available, while
// these dashboard numbers now reflect the editable patient records.
if (window.MediMama) {
    function refreshSharedSummary() {
        const data = MediMama.load();
        const cards = document.querySelectorAll('.stats-grid .stat-card strong');
        if (cards[0]) cards[0].childNodes[0].textContent = data.mothers.length;
        if (cards[1]) cards[1].childNodes[0].textContent = data.infants.length;
        if (cards[2]) cards[2].childNodes[0].textContent = data.appointments.filter(item => item.status === 'Scheduled' || item.status === 'Requested').length + ' ';
        if (cards[3]) cards[3].childNodes[0].textContent = data.concerns.filter(item => item.status !== 'Resolved').length + ' ';
        const table = document.querySelector('.concerns-panel .report-table');
        if (table && data.concerns.length) {
            table.innerHTML = `<div class="report-head"><span>Patient</span><span>Concern</span><span>Date</span><span>Status</span></div>${data.concerns.slice(0, 5).map(item => `<div><span>${escapeHtml(MediMama.patientName(item.patientType, item.patientId))}</span><span>${escapeHtml(item.type)}</span><span>${new Date(item.createdAt).toLocaleDateString('en-PH')}</span><b class="${item.status === 'Resolved' ? 'resolved' : 'pending'}">${escapeHtml(item.status)}</b></div>`).join('')}`;
        }
    }
    refreshSharedSummary();
    window.addEventListener('medimama:data-changed', refreshSharedSummary);
}
