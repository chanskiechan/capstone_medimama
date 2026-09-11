const storageKey = 'medimama-admin-announcements';
const archiveKey = 'medimama-archive-center';
const form = document.getElementById('announcementForm');
const modal = document.getElementById('announcementModal');
const list = document.getElementById('announcementList');
const imageInput = document.getElementById('image');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const formTitle = document.getElementById('formTitle');
const today = new Date().toISOString().slice(0, 10);
let selectedImage = '';
let toastTimer;

const starterAnnouncements = [
    { id:'welcome-clinic', title:'Free prenatal check-up this Friday', description:'Mothers in their second and third trimester may visit the health center this Friday from 8:00 AM to 3:00 PM for a free prenatal check-up. Please bring your maternal health record.', audience:'Mothers & caregivers', priority:'High', publishDate:today, expiryDate:'', tags:['prenatal','clinic schedule'], pinned:true, image:'', status:'published', updatedAt:Date.now() },
    { id:'immunization-reminder', title:'July immunization schedule is now available', description:'Please check your child\'s appointment date and arrive 15 minutes early. Bring the infant immunization card for updating.', audience:'Mothers & caregivers', priority:'Normal', publishDate:today, expiryDate:'', tags:['immunization','reminder'], pinned:false, image:'', status:'published', updatedAt:Date.now()-1 },
    { id:'old-advisory', title:'Health center holiday hours', description:'The health center will observe adjusted hours during the public holiday.', audience:'Everyone', priority:'Low', publishDate:'2026-06-01', expiryDate:'2026-06-13', tags:['clinic schedule'], pinned:false, image:'', status:'archived', updatedAt:Date.now()-2 }
];

function getAnnouncements() { try { const saved = JSON.parse(localStorage.getItem(storageKey)); return Array.isArray(saved) ? saved : starterAnnouncements; } catch { return starterAnnouncements; } }
function saveAnnouncements(items) { localStorage.setItem(storageKey, JSON.stringify(items)); }
function getArchiveCenter() { try { return JSON.parse(localStorage.getItem(archiveKey)) || []; } catch { return []; } }
function saveArchiveCenter(items) { localStorage.setItem(archiveKey, JSON.stringify(items)); }
function addToArchive(item) { const archive = getArchiveCenter().filter(entry => !(entry.source === 'Announcements' && entry.recordId === item.id)); archive.unshift({ id:`archive-${Date.now()}`, source:'Announcements', recordId:item.id, title:item.title, archivedAt:new Date().toISOString() }); saveArchiveCenter(archive); }
function removeFromArchive(id) { saveArchiveCenter(getArchiveCenter().filter(entry => !(entry.source === 'Announcements' && entry.recordId === id))); }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value || ''; return div.innerHTML; }
function showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
function formatDate(date) { if (!date) return ''; return new Intl.DateTimeFormat('en-PH', { month:'short', day:'numeric', year:'numeric' }).format(new Date(`${date}T00:00:00`)); }

function render() {
    const query = document.getElementById('announcementSearch').value.trim().toLowerCase();
    const status = document.getElementById('statusFilter').value;
    const audience = document.getElementById('audienceFilter').value;
    const priority = document.getElementById('priorityFilter').value;
    const all = getAnnouncements();
    document.getElementById('publishedCount').textContent = all.filter(item => item.status === 'published').length;
    document.getElementById('archivedCount').textContent = all.filter(item => item.status === 'archived').length;
    document.getElementById('pinnedCount').textContent = all.filter(item => item.status === 'published' && item.pinned).length;
    const items = all.filter(item => {
        const searchable = `${item.title} ${item.description} ${(item.tags || []).join(' ')}`.toLowerCase();
        return (!query || searchable.includes(query)) && (status === 'all' || item.status === status) && (audience === 'all' || item.audience === audience) && (priority === 'all' || item.priority === priority);
    }).sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
    if (!items.length) { list.innerHTML = '<div class="empty-state"><i class="fa-regular fa-folder-open"></i>No announcements match these filters.</div>'; return; }
    list.innerHTML = items.map(item => { const isArchived = item.status === 'archived'; const archiveLabel = isArchived ? 'Restore archived announcement' : 'Archive announcement'; return `<article class="announcement-card ${isArchived ? 'archived' : ''}"><div class="card-content"><div class="card-top"><h2>${escapeHtml(item.title)}</h2>${item.pinned ? '<i class="fa-solid fa-thumbtack pinned" title="Pinned"></i>' : ''}<span class="pill ${item.priority.toLowerCase()}">${escapeHtml(item.priority)} priority</span>${isArchived ? '<span class="pill archived">Archived</span>' : ''}</div><div class="card-meta"><span><i class="fa-solid fa-users"></i>${escapeHtml(item.audience)}</span><span><i class="fa-regular fa-calendar"></i>Published ${formatDate(item.publishDate)}</span>${item.expiryDate ? `<span><i class="fa-regular fa-clock"></i>Expires ${formatDate(item.expiryDate)}</span>` : ''}</div><p class="card-description">${escapeHtml(item.description)}</p>${item.image ? `<img class="announcement-image" src="${item.image}" alt="Image attached to ${escapeHtml(item.title)}">` : ''}<div class="tag-list">${(item.tags || []).filter(Boolean).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}</div></div><div class="card-actions"><button class="icon-button" type="button" data-action="edit" data-id="${item.id}" aria-label="Edit announcement" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="icon-button" type="button" data-action="archive" data-id="${item.id}" aria-label="${archiveLabel}" title="${archiveLabel}"><i class="fa-solid ${isArchived ? 'fa-box-open' : 'fa-box-archive'}"></i></button></div></article>`; }).join('');
}

function openModal(item) {
    form.reset(); selectedImage = ''; imagePreview.hidden = true; document.getElementById('descriptionCount').textContent = '0';
    if (item) { formTitle.textContent = 'Edit announcement'; document.getElementById('announcementId').value = item.id; document.getElementById('title').value = item.title; document.getElementById('description').value = item.description; document.getElementById('audience').value = item.audience; document.getElementById('priority').value = item.priority; document.getElementById('publishDate').value = item.publishDate; document.getElementById('expiryDate').value = item.expiryDate || ''; document.getElementById('tags').value = (item.tags || []).join(', '); document.getElementById('pinned').checked = item.pinned; document.getElementById('descriptionCount').textContent = item.description.length; selectedImage = item.image || ''; if (selectedImage) { previewImage.src = selectedImage; imagePreview.hidden = false; } } else { formTitle.textContent = 'Create announcement'; document.getElementById('publishDate').value = today; }
    modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.getElementById('title').focus();
}
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }
function upsert(status) {
    if (status === 'published' && !form.reportValidity()) return;
    const id = document.getElementById('announcementId').value || `announcement-${Date.now()}`;
    const all = getAnnouncements(); const previous = all.find(item => item.id === id);
    const item = { id, title:document.getElementById('title').value.trim() || 'Untitled announcement', description:document.getElementById('description').value.trim(), audience:document.getElementById('audience').value, priority:document.getElementById('priority').value, publishDate:document.getElementById('publishDate').value || today, expiryDate:document.getElementById('expiryDate').value, tags:document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(Boolean), pinned:document.getElementById('pinned').checked, image:selectedImage, status, updatedAt:Date.now() };
    if (previous) Object.assign(previous,item); else all.push(item); saveAnnouncements(all); closeModal(); render(); showToast(status === 'archived' ? 'Announcement saved as draft.' : previous ? 'Announcement updated.' : 'Announcement published.');
}

document.getElementById('newAnnouncement').addEventListener('click', () => openModal());
document.getElementById('closeModal').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.getElementById('saveDraft').addEventListener('click', () => upsert('archived'));
form.addEventListener('submit', event => { event.preventDefault(); upsert('published'); });
document.getElementById('description').addEventListener('input', event => document.getElementById('descriptionCount').textContent = event.target.value.length);
imageInput.addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { showToast('Please select an image smaller than 2 MB.'); imageInput.value = ''; return; } const reader = new FileReader(); reader.onload = () => { selectedImage = reader.result; previewImage.src = selectedImage; imagePreview.hidden = false; }; reader.readAsDataURL(file); });
document.getElementById('removeImage').addEventListener('click', () => { selectedImage = ''; imageInput.value = ''; imagePreview.hidden = true; });
// Keep archived records grouped by their source module in Backup & Restore.
list.addEventListener('click', event => {
    const button = event.target.closest('[data-action="archive"]');
    if (!button) return;
    const item = getAnnouncements().find(entry => entry.id === button.dataset.id);
    if (!item) return;
    if (item.status === 'published') addToArchive(item); else removeFromArchive(item.id);
});
list.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (!button) return; const all = getAnnouncements(); const item = all.find(entry => entry.id === button.dataset.id); if (!item) return; if (button.dataset.action === 'edit') openModal(item); if (button.dataset.action === 'archive') { item.status = item.status === 'published' ? 'archived' : 'published'; item.updatedAt = Date.now(); saveAnnouncements(all); render(); showToast(item.status === 'archived' ? 'Announcement archived.' : 'Announcement restored.'); } if (button.dataset.action === 'delete') { if (item.status === 'deleted') { item.status = 'published'; item.updatedAt = Date.now(); saveAnnouncements(all); render(); showToast('Deleted announcement restored.'); } else if (confirm(`Move “${item.title}” to deleted announcements? You can restore it later.`)) { item.status = 'deleted'; item.updatedAt = Date.now(); saveAnnouncements(all); render(); showToast('Announcement moved to deleted announcements.'); } } });
['announcementSearch','statusFilter','audienceFilter','priorityFilter'].forEach(id => document.getElementById(id).addEventListener(id === 'announcementSearch' ? 'input' : 'change', render));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
render();
