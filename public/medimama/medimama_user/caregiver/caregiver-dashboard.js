const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalKicker = document.getElementById('modalKicker');
const modalBody = document.getElementById('modalBody');
const toast = document.getElementById('toast');
const taskCount = document.getElementById('taskCount');
const completedCount = document.getElementById('completedCount');
let caregiverSession = {};
try { caregiverSession = JSON.parse(localStorage.getItem('medimama-current-session')) || {}; } catch { caregiverSession = {}; }
if (caregiverSession.role === 'caregiver' && caregiverSession.name) {
  const firstName = caregiverSession.name.split(/\s+/)[0];
  document.getElementById('caregiverName').textContent = caregiverSession.name;
  document.getElementById('caregiverInitials').textContent = caregiverSession.name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('caregiverGreeting').textContent = `Good morning, ${firstName}!`;
}

let linkedCaregiver = null;
let linkedInfant = null;
if (window.MediMama && caregiverSession.role === 'caregiver') {
  linkedCaregiver = MediMama.caregivers().find(item => item.name.toLowerCase() === String(caregiverSession.name || '').toLowerCase()) || MediMama.caregivers()[0];
  linkedInfant = MediMama.getInfant(linkedCaregiver?.patientIds?.[0]);
  const mother = linkedInfant && MediMama.getMother(linkedInfant.motherId);
  if (linkedInfant) {
    document.querySelector('.welcome span:not(.baby-icon):not(.linked-person span span)')?.replaceChildren(document.createTextNode(`Here is what needs your attention for ${linkedInfant.name} today.`));
    document.querySelector('.linked-person strong').textContent = linkedInfant.name;
    document.querySelector('.linked-person small').textContent = `${Math.max(0, Math.floor((Date.now() - new Date(linkedInfant.birthDate)) / 2629800000))} months old · Linked to your care`;
    document.querySelector('.linked-person button').dataset.modal = 'profile';
  }
}

const views = {
  profile: ['Linked care profile', linkedInfant?.name || 'Linked infant', `<div class="modal-content">Age: ${linkedInfant ? Math.floor((Date.now() - new Date(linkedInfant.birthDate)) / 2629800000) : '—'} months · ${linkedInfant?.sex || '—'}<br>Primary parent: ${linkedInfant ? MediMama.getMother(linkedInfant.motherId)?.name || 'Not recorded' : 'Not recorded'}<br>Caregiver access: ${(linkedCaregiver?.permissions || []).join(', ') || 'view records'}.</div>`],
  appointment: ['Appointment details', 'Infant Immunization', '<div class="modal-content"><strong>August 28, 2026, 9:00 AM</strong><br>Barangay Health Center<br><br>Please bring the immunization card and arrive 15 minutes early. The health worker will review Baby Patrick’s vaccination record.</div>'],
  allTasks: ['Daily care plan', 'Today\'s Tasks', '<div class="modal-content"><ul><li>Morning feeding — completed</li><li>Give Vitamin D drops at 8:00 PM</li><li>Supervised tummy time at 2:00 PM</li><li>Record feeding and diaper changes</li></ul></div>'],
  symptoms: ['Health concern', 'Report a Symptom', '<form class="modal-form" id="reportForm"><label>Describe the symptom<textarea required placeholder="Include when it started and any changes you observed"></textarea></label><button type="submit">Send report</button></form>'],
  careNote: ['Care notes', 'Add Care Note', '<form class="modal-form" id="noteForm"><label>What would you like to record?<textarea required placeholder="Example: Feeding, sleep, diaper change, or behavior update"></textarea></label><button type="submit">Save note</button></form>'],
  contacts: ['Support contacts', 'Contact Health Worker', '<div class="modal-content"><strong>Barangay Health Center</strong><br>0917 555 2026<br><br><strong>For emergencies</strong><br>Call your local emergency service immediately. Do not wait for a dashboard response for severe symptoms.</div>'],
  schedule: ['Care schedule', 'Upcoming Schedule', '<div class="modal-content"><strong>Today:</strong> Vitamin D, tummy time, and care-note update.<br><br><strong>August 28:</strong> Infant immunization at 9:00 AM.</div>'],
  account: ['Account', 'Caregiver profile', '<div class="modal-content">Your caregiver access is active for the linked patient. Contact the health worker if the linked patient or relationship needs to be updated.</div>']
};

function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
function openModal(name) { const view = views[name]; if (!view) return; modalKicker.textContent = view[0]; modalTitle.textContent = view[1]; modalBody.innerHTML = view[2]; modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }

document.querySelectorAll('[data-modal]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.modal)));
document.getElementById('caregiverLogout').addEventListener('click', () => { localStorage.removeItem('medimama-current-session'); window.location.href = '../../medimama_admin/medimamaloginandsignup/medimamalogin.html'; });
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
document.getElementById('notificationButton').addEventListener('click', event => { const panel = document.getElementById('notificationPanel'); panel.classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', panel.classList.contains('open')); });
document.querySelectorAll('[data-message]').forEach(button => button.addEventListener('click', () => { showToast(button.dataset.message); document.getElementById('notificationPanel').classList.remove('open'); }));
document.querySelectorAll('.task input').forEach(input => input.addEventListener('change', () => { const item = input.closest('.task'); item.classList.toggle('done', input.checked); const all = document.querySelectorAll('.task input'); const complete = document.querySelectorAll('.task input:checked').length; taskCount.textContent = all.length - complete; completedCount.textContent = complete; showToast(input.checked ? 'Task marked complete.' : 'Task moved back to today.'); }));
modalBody.addEventListener('submit', event => { event.preventDefault(); const text = event.target.querySelector('textarea')?.value.trim(); if (event.target.id === 'noteForm' && linkedInfant) { MediMama.addRecord('Infant', linkedInfant.id, { type: 'Caregiver care note', details: text, status: 'Reported' }); } if (event.target.id === 'reportForm' && linkedInfant) { MediMama.addConcern({ patientType: 'infant', patientId: linkedInfant.id, type: 'Caregiver symptom report', details: text, reportedBy: caregiverSession.name }); } closeModal(); showToast(event.target.id === 'noteForm' ? 'Care note saved to the infant record.' : 'Health concern sent to the health worker.'); });
