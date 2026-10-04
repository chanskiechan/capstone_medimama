import test from 'node:test';
import assert from 'node:assert/strict';
import { hydratePatients, appointmentDateTime } from './lib/clinical.js';
import { assistantReply, csvCell, reportRows, dueReminders } from './lib/support.js';
import { today } from './care.js';
import { validateBackup, backupTables } from './lib/backup.js';
const data = { mothers: [{id:'m',name:'Mother',accountId:'u'}, {id:'other',name:'Other family',accountId:'v'}], infants: [], caregivers: [], appointments: [{ patientId:'other',patient:'Other family',date:today(),time:'09:00',status:'Approved',service:'Private visit' }] };
test('assistant never answers with another family appointment',()=>{
  assert.match(assistantReply('next appointment',data,{id:'u',role:'mother'}).text,/No upcoming/);
  assert.doesNotMatch(assistantReply('next appointment',data,{id:'u',role:'mother'}).text,/Private visit/);
});
test('assistant handles distinct educational topics and symptom questions',()=>{
  assert.match(assistantReply('family planning',data,{}).url,/contraception/);
  assert.match(assistantReply('breastfeeding',data,{}).url,/feeding/);
  assert.match(assistantReply('my baby has a fever',data,{}).text,/cannot assess/);
});
test('timestamps are converted to Philippine date and time',()=>{
  assert.deepEqual(appointmentDateTime('2026-09-29T23:30:00Z'),{date:'2026-09-30',time:'07:30'});
});
test('database clinical records hydrate a fresh browser',()=>{
  const result = hydratePatients([{id:'m',full_name:'Mother',maternal_status:'postnatal',delivery_date:'2026-01-01'}],[{id:'i',full_name:'Baby',mother_id:'m',birth_date:'2026-01-01',status:'active'}],[{mother_id:'m',record_date:'2026-01-02',record_type:'Postnatal check-up'}],[{infant_id:'i',measured_at:'2026-01-02',weight_kg:3.2}], [{infant_id:'i',administered_at:'2026-01-01',vaccine:'BCG',dose:'Birth dose'}],[{infant_id:'i',record_date:'2026-01-02',record_type:'Hearing test',details:'Recorded'}]);
  assert.equal(result.mothers[0].records.length,1);
  assert.equal(result.infants[0].growth[0].weight,3.2);
  assert.equal(result.infants[0].vaccines[0].status,'Complete');
  assert.equal(result.infants[0].screenings[0].result,'Recorded');
});
test('reports filter dates and exclude unadministered doses',()=>{
  const rows = reportRows({...data,infants:[{id:'i',name:'Baby',vaccines:[{date:'2026-01-01',status:'Due'},{date:'2026-01-02',status:'Complete',vaccine:'BCG'}]}]},'2026-01-01','2026-01-31');
  assert.equal(rows.length,1); assert.equal(rows[0].type,'Vaccination');
});
test('CSV escapes quotes, newlines and spreadsheet formulas',()=>{
  assert.equal(csvCell('=1+1'),'"\'=1+1"');
  assert.equal(csvCell('a"b\nc'),'"a""b\nc"');
});
test('archived infants are excluded from due reminders',()=>{
  assert.deepEqual(dueReminders({...data,infants:[{id:'i',motherId:'m',birthDate:'2026-01-01',status:'Active',archived:true}]},{id:'u',role:'mother'}),[]);
});
test('education works during a record outage, record answers explain unavailable data',()=>{
  assert.match(assistantReply('family planning',data,{}, {error:'offline'}).url,/contraception/);
  assert.match(assistantReply('next appointment',data,{}, {error:'offline'}).text,/cannot check/);
  assert.match(assistantReply('vaccines due',data,{}, {loading:true}).text,/still loading/);
});
test('common Tagalog prompts route to supported resources or symptom guidance',()=>{
  assert.match(assistantReply('pagpapasuso',data,{}).url,/feeding/);
  assert.match(assistantReply('may lagnat ang baby',data,{}).text,/cannot assess/);
  assert.match(assistantReply('kailan ang susunod na bakuna',data,{}).text,/vaccine reminders/);
});
test('backup preview rejects other projects and unexpected tables',()=>{
  const backup={format:'medimama-clinical',version:1,project:'https://test.supabase.co',tables:Object.fromEntries(backupTables.map(t=>[t,[]]))};
  assert.equal(validateBackup(backup,backup.project).length,backupTables.length);
  assert.throws(()=>validateBackup(backup,'https://other.supabase.co'),/different/);
  assert.throws(()=>validateBackup({...backup,tables:{...backup.tables,profiles:[]}},backup.project),/unsupported/);
});
