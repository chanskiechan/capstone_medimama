const modules = [...document.querySelectorAll('.module')];
const tabButtons = [...document.querySelectorAll('[data-tab-target]')];
const searchInput = document.querySelector('#tableSearch');
const statusFilter = document.querySelector('#statusFilter');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
let activeModule = 'prenatal';

const fields = {
  prenatal: [['Patient ID','text'],["Mother's Name",'text'],['Gestational Age','text'],['EDD','date'],['Risk Assessment','select','Normal,Moderate,High Risk'],['Blood Pressure','text'],['Notes','textarea']],
  postnatal: [['Record ID','text'],["Mother's Name",'text'],['Delivery Date','date'],['Delivery Type','select','NSVD,C-section'],['Recovery Stage','text'],['Feeding Method','select','Exclusive breastfeeding,Mixed,Formula'],['Delivery Notes / Complications','textarea']],
  immunization: [['Infant ID','text'],['Child Name','text'],["Mother's Name",'text'],['Vaccine','select','BCG,Hepatitis B (BD),Pentavalent,OPV,PCV,MMR'],['Due Date','date'],['Batch / Lot Number','text'],['Administering Health Worker','text']],
  appointments: [['Appointment ID','text'],['Patient Name','text'],['Service Type','select','Prenatal Visit,Postnatal Checkup,Infant Immunization,Emergency,Follow-up'],['Date','date'],['Time','time'],['Assigned Staff / Room','text'],['Reminder Note','textarea']]
};

function setActiveModule(id) {
  activeModule = id;
  modules.forEach(module => module.classList.toggle('active', module.id === id));
  tabButtons.forEach(button => button.classList.toggle('active', button.dataset.tabTarget === id));
  document.querySelectorAll('[data-healthcare-tab]').forEach(link => link.classList.toggle('active', link.dataset.healthcareTab === id));
  window.history.replaceState({}, '', `${window.location.pathname}?tab=${id}`);
  searchInput.value = '';
  buildStatusOptions();
  filterRows();
}

// Used by the shared sidebar so its record links can switch modules without
// reloading this page or resetting the expanded sidebar.
window.MediMamaHealthcare = { selectTab: setActiveModule };

function buildStatusOptions() {
  const values = [...new Set([...document.querySelectorAll(`#${activeModule} .table-row`)].map(row => row.dataset.status))];
  statusFilter.innerHTML = '<option value="">Filter by Status</option>' + values.map(value => `<option>${value}</option>`).join('');
}

function filterRows() {
  const term = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  document.querySelectorAll(`#${activeModule} .table-row`).forEach(row => {
    row.hidden = !(row.textContent.toLowerCase().includes(term) && (!status || row.dataset.status === status));
  });
}

function labelToName(label) { return label.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
function openModal(action = 'add') {
  const title = document.querySelector(`#${activeModule}`).dataset.title;
  document.querySelector('#modalLabel').textContent = action === 'add' ? `NEW ${title.toUpperCase()}` : `${action.toUpperCase()} ${title.toUpperCase()}`;
  document.querySelector('#modalTitle').textContent = action === 'add' ? `Add ${title}` : `${action[0].toUpperCase() + action.slice(1)} ${title}`;
  document.querySelector('#formFields').innerHTML = fields[activeModule].map(([label,type,options]) => {
    const name = labelToName(label);
    if (type === 'textarea') return `<label>${label}<textarea name="${name}" placeholder="Enter details..."></textarea></label>`;
    if (type === 'select') return `<label>${label}<select name="${name}"><option value="">Select ${label}</option>${options.split(',').map(option => `<option>${option}</option>`).join('')}</select></label>`;
    return `<label>${label}<input name="${name}" type="${type}" placeholder="Enter ${label.toLowerCase()}"></label>`;
  }).join('');
  modal.classList.add('open');
  document.querySelector('#formFields input')?.focus();
}
function closeModal(){modal.classList.remove('open')}
function showToast(message){toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2800)}

tabButtons.forEach(button => button.addEventListener('click', () => setActiveModule(button.dataset.tabTarget)));
searchInput.addEventListener('input', filterRows);
statusFilter.addEventListener('change', filterRows);
document.querySelector('#addRecord').addEventListener('click', () => openModal());
document.querySelector('#closeModal').addEventListener('click', closeModal);
document.querySelector('#cancelModal').addEventListener('click', closeModal);
modal.addEventListener('click', event => {if(event.target === modal) closeModal()});
document.addEventListener('keydown', event => {if(event.key === 'Escape') closeModal()});

document.querySelector('.content').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'administer') { const row = event.target.closest('.table-row'); row.dataset.status = 'Completed'; row.querySelector('.badge').textContent = 'Completed'; row.querySelector('.badge').className = 'badge normal'; event.target.closest('.row-actions').querySelector('[data-action="administer"]')?.remove(); buildStatusOptions(); filterRows(); showToast('Vaccine marked as administered.'); return; }
  if (action === 'update') { showToast('Appointment status options opened.'); return; }
  openModal(action);
});

document.querySelectorAll('.view-switch button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.view-switch button').forEach(item => item.classList.toggle('active', item === button));
  const calendar = button.dataset.view === 'calendar';
  document.querySelector('#appointmentTable').hidden = calendar;
  document.querySelector('#appointmentCalendar').hidden = !calendar;
}));

document.querySelector('#recordForm').addEventListener('submit', event => {event.preventDefault();closeModal();showToast(`${document.querySelector(`#${activeModule}`).dataset.title} saved successfully.`)});
const initialTab = new URLSearchParams(window.location.search).get('tab');
if (modules.some(module => module.id === initialTab)) setActiveModule(initialTab);
else buildStatusOptions();
