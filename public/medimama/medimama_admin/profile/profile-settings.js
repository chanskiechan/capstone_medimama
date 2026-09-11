const profileKey = 'medimama-admin-profile';
const defaults = { name:'MediMama Administrator', email:'admin@medimama.test', phone:'0917 555 0100', facility:'Barangay Health Center', position:'System Administrator' };
let profile = defaults;
try { profile = { ...defaults, ...(JSON.parse(localStorage.getItem(profileKey)) || {}) }; } catch { profile = defaults; }
document.getElementById('profileName').value = profile.name;
document.getElementById('profileEmail').value = profile.email;
document.getElementById('profilePhone').value = profile.phone;
document.getElementById('profilePosition').value = profile.position;
document.getElementById('profileFacility').value = profile.facility;
let photoData = profile.photo || '';
let editing = false;
const editableFields = ['profileName','profileEmail','profilePhone','profilePosition','profileFacility','profileImage','removePhoto'];
function setEditing(enabled) {
    editing = enabled;
    editableFields.forEach(id => { const field=document.getElementById(id); if (field) field.disabled=!enabled; });
    document.getElementById('editProfile').hidden=enabled;
    document.getElementById('saveProfile').hidden=!enabled;
}
function renderPhoto() { document.getElementById('profilePhoto').innerHTML = photoData ? `<img src="${photoData}" alt="Administrator profile photo">` : '<i class="fa-solid fa-user"></i>'; }
renderPhoto();
document.getElementById('profileImage').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('Choose an image smaller than 1 MB.'); event.target.value=''; return; }
    const reader = new FileReader();
    reader.onload = () => { photoData = reader.result; renderPhoto(); };
    reader.readAsDataURL(file);
});
document.getElementById('removePhoto').addEventListener('click', () => { photoData=''; document.getElementById('profileImage').value=''; renderPhoto(); });
let toastTimer;
function showToast(message) { const toast=document.getElementById('toast'); toast.textContent=message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),2600); }
document.getElementById('saveProfile').addEventListener('click',()=>{
    const name=document.getElementById('profileName').value.trim();
    const email=document.getElementById('profileEmail').value.trim();
    if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) { showToast('Enter a valid name and email address.'); return; }
    localStorage.setItem(profileKey,JSON.stringify({ name,email,phone:document.getElementById('profilePhone').value.trim(),position:document.getElementById('profilePosition').value,facility:document.getElementById('profileFacility').value.trim(),photo:photoData }));
    setEditing(false);
    showToast('Profile settings saved on this device.');
});
document.getElementById('editProfile').addEventListener('click', () => setEditing(true));
setEditing(false);
