export function hydratePatients(mothers, infants, maternal, growth, vaccines, infantRecords) {
  return {
    mothers: mothers.map(m => ({ ...m, ...m.care_plan, name: m.full_name, recordCode: m.record_code,
      archived: m.status === 'archived', status: m.maternal_status === 'postnatal' ? 'Postnatal' : 'Pregnant',
      contact: m.contact_number, gestationWeeks: m.gestation_weeks, gestationDate: m.gestation_date, deliveryDate: m.delivery_date,
      records: maternal.filter(r => r.mother_id === m.id).map(r => ({ ...r, date: r.record_date, type: r.record_type })) })),
    infants: infants.map(i => ({ ...i, name: i.full_name, recordCode: i.record_code, motherId: i.mother_id,
      birthDate: i.birth_date, birthWeight: i.birth_weight_kg, birthLength: i.birth_length_cm,
      placeOfBirth: i.place_of_birth, bloodType: i.blood_type, fatherName: i.guardian_name, guardianContact: i.guardian_contact, medicalNotes: i.medical_notes,
      archived: i.status === 'archived', status: i.status === 'active' ? 'Active' : i.status === 'archived' ? 'Archived' : i.status === 'needs_follow_up' ? 'Needs follow-up' : 'Pending approval',
      growth: growth.filter(r => r.infant_id === i.id).map(r => ({ ...r, date: r.measured_at, weight: r.weight_kg, length: r.length_cm, muac: r.muac_cm })),
      vaccines: vaccines.filter(r => r.infant_id === i.id).map(r => ({ ...r, date: r.administered_at, status: 'Complete' })),
      records: infantRecords.filter(r => r.infant_id === i.id && !['Newborn screening', 'Hearing test'].includes(r.record_type)).map(r => ({ ...r, date: r.record_date, type: r.record_type })),
      screenings: infantRecords.filter(r => r.infant_id === i.id && ['Newborn screening', 'Hearing test'].includes(r.record_type)).map(r => ({ ...r, date: r.record_date, type: r.record_type, result: r.details, status: 'Completed' })),
    })),
  };
}
export function appointmentDateTime(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
