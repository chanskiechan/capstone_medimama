import { useEffect, useState } from 'react';
import { FamilyHeader } from './FamilyPortal';
import { PageStyles } from '../components/PageStyles';
import { supabase } from '../lib/supabase';
import { session, today } from '../care';
import { useStore } from '../store';
import './MotherProfile.css';

export default function MotherProfile() {
  const user = session();
  const { refreshPatientData } = useStore();
  const [profile, setProfile] = useState({ full_name: user.name || '', phone: '', avatar_url: '' });
  const [mother, setMother] = useState({ full_name: user.name || '', address: '', maternal_status: 'pregnant', delivery_date: '' });
  const [editing, setEditing] = useState(false);
  const [editingStatus, setEditingStatus] = useState('pregnant');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: profileData } = await supabase.from('profiles').select('full_name, phone, avatar_url').eq('id', user.id).single();
      const { data: link } = await supabase.from('mother_accounts').select('mother_id').eq('user_id', user.id).maybeSingle();
      const { data: motherData } = link ? await supabase.from('mothers').select('full_name, address, maternal_status, delivery_date').eq('id', link.mother_id).single() : { data: null };
      if (!active) return;
      if (profileData) {
        const savedPhone = profileData.phone || '';
        const phone = /^9\d{9}$/.test(savedPhone) ? `0${savedPhone}` : savedPhone;
        setProfile(current => ({ ...current, ...profileData, phone, full_name: profileData.full_name || user.name || '' }));
      }
      if (motherData) setMother(current => ({ ...current, ...motherData, full_name: motherData.full_name || user.name || '', maternal_status: motherData.maternal_status || 'pregnant', delivery_date: motherData.delivery_date || '' }));
    };
    load();
    return () => { active = false; };
  }, [user.id]);

  const saveDetails = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    const expectedDeliveryDate = values.maternal_status === 'pregnant' ? values.delivery_date || null : null;
    let { error } = await supabase.rpc('update_my_mother_profile', { new_full_name: values.full_name, new_address: values.address, new_phone: values.phone, new_maternal_status: values.maternal_status, new_delivery_date: expectedDeliveryDate });
    // Existing projects may still have the earlier four-argument RPC in the
    // PostgREST schema cache. Save through it, then update the contact number.
    if (error?.message?.includes('Could not find the function')) {
      const legacy = await supabase.rpc('update_my_mother_profile', { new_full_name: values.full_name, new_address: values.address, new_maternal_status: values.maternal_status, new_delivery_date: expectedDeliveryDate });
      error = legacy.error;
      if (!error) {
        // Newer versions accept 09XXXXXXXXX. If this project still has the
        // original 10-digit RPC, retry with its legacy no-leading-zero format.
        let contact = await supabase.rpc('update_my_contact', { new_phone: values.phone });
        if (contact.error?.message?.includes('10-digit') && values.phone.startsWith('0')) {
          contact = await supabase.rpc('update_my_contact', { new_phone: values.phone.slice(1) });
        }
        error = contact.error;
      }
    }
    if (error) { setBusy(false); return setNotice(error.message); }
    // Update the shared family data immediately. Without this, the infant
    // page waits for the periodic refresh before it sees Postnatal status.
    await refreshPatientData?.();
    setBusy(false);
    const next = { full_name: values.full_name.trim(), address: values.address.trim(), maternal_status: values.maternal_status, delivery_date: expectedDeliveryDate || '' };
    setMother(next); setProfile(current => ({ ...current, full_name: next.full_name, phone: values.phone }));
    localStorage.setItem('medimama-current-session', JSON.stringify({ ...user, name: next.full_name }));
    setEditing(false); setNotice('Profile and maternal status updated.');
  };

  const upload = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) return setNotice('Choose a PNG, JPEG, or WebP image up to 2 MB.');
    setBusy(true); const extension = file.name.split('.').pop().toLowerCase(); const path = `${user.id}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
    if (uploadError) { setBusy(false); return setNotice(uploadError.message); }
    const { data: url } = supabase.storage.from('avatars').getPublicUrl(path); const avatarUrl = `${url.publicUrl}?v=${Date.now()}`;
    const { error } = await supabase.rpc('update_my_avatar', { new_avatar_url: avatarUrl }); setBusy(false);
    if (error) return setNotice(error.message);
    setProfile(current => ({ ...current, avatar_url: avatarUrl })); window.dispatchEvent(new CustomEvent('medimama-avatar-updated', { detail: avatarUrl })); setNotice('Profile photo updated.');
  };

  const displayName = profile.full_name || mother.full_name || user.name || 'Mother';
  const initials = displayName.split(' ').filter(Boolean).map(name => name[0]).join('').slice(0, 2) || 'M';
  const maternalLabel = mother.maternal_status === 'postnatal' ? 'Postnatal' : 'Prenatal';
  const contactLabel = profile.phone || 'Not recorded';
  return <><PageStyles page="user" /><FamilyHeader /><main className="family-page mother-profile-page"><header><div><p>MediMama care</p><h1>My profile</h1><span>Update your contact details, profile photo, and maternal status.</span></div><button className="family-primary" onClick={() => { setNotice(''); setEditingStatus(mother.maternal_status || 'pregnant'); setEditing(true); }}><i className="fa-solid fa-pen" /> Edit profile</button></header>{notice && <p className="mother-profile-notice">{notice}</p>}<section className="mother-profile-card"><div className="mother-avatar-wrap">{profile.avatar_url ? <img src={profile.avatar_url} alt="Profile" /> : <span>{initials}</span>}<label className="mother-avatar-edit"><i className="fa-solid fa-camera" /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={busy} /></label></div><div><h2>{displayName}</h2><p>Mother account · <b>{maternalLabel}</b></p><small>PNG, JPEG, or WebP · maximum 2 MB</small></div></section><section className="mother-details-card"><h2>Profile details</h2><div className="mother-details-grid"><label>Full name<input value={displayName} readOnly /></label><label>Email address<input value={user.email || 'Not recorded'} readOnly /></label><label>Contact number<input value={contactLabel} readOnly /></label><label>Address<input value={mother.address || 'Not recorded'} readOnly /></label><label>Maternal status<input value={maternalLabel} readOnly /></label>{mother.maternal_status === 'pregnant' && <label>Expected delivery date<input value={mother.delivery_date || 'Not recorded'} readOnly /></label>}</div></section>{editing && <div className="mother-profile-modal" onMouseDown={event => event.target === event.currentTarget && !busy && setEditing(false)}><form onSubmit={saveDetails}><button className="mother-profile-close" type="button" onClick={() => setEditing(false)} aria-label="Close">×</button><p>MediMama care</p><h2>Edit profile</h2><label>Full name<input name="full_name" defaultValue={mother.full_name || displayName} required /></label><label>Philippine mobile number<input name="phone" defaultValue={profile.phone || ''} onInput={event => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 11); }} placeholder="09XXXXXXXXX" inputMode="numeric" pattern="09[0-9]{9}" required /><small>Enter 11 digits starting with 09.</small></label><label>Address<input name="address" defaultValue={mother.address || ''} placeholder="House no., street, subdivision, or landmark" /></label><label>Maternal status<select name="maternal_status" value={editingStatus} onChange={event => setEditingStatus(event.target.value)}><option value="pregnant">Prenatal</option><option value="postnatal">Postnatal</option></select></label>{editingStatus === 'pregnant' && <label>Expected delivery date <small>Required for Prenatal</small><input name="delivery_date" type="date" min={today()} defaultValue={mother.delivery_date || ''} required /></label>}<div className="mother-profile-actions"><button type="button" className="mother-profile-cancel" onClick={() => setEditing(false)} disabled={busy}>Cancel</button><button className="family-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div></form></div>}</main></>;
}
