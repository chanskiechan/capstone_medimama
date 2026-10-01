import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, checkImageFiles, validateReportImages } from './lib/concernReports.js';
test('report requires linked patient, subject and actual past symptom time',()=>{
  const values={patient:'baby',category:'Post-vaccination',subject:'Concern',description:'Details',started_at:'2026-01-01T10:00'};
  const now=Date.parse('2026-01-02T00:00:00Z');
  assert.equal(validateReport(values,[{id:'baby'}],now),'');
  assert.match(validateReport(values,[],now),/linked patient/);
  assert.match(validateReport({...values,subject:' '},[{id:'baby'}],now),/subject/);
  assert.match(validateReport({...values,started_at:'2027-01-01T10:00'},[{id:'baby'}],now),/future/);
});
test('photos enforce type, size, existing count and content format',async()=>{
  const png=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'photo.png',{type:'image/png'});
  await checkImageFiles([png]);
  assert.match(validateReportImages([png,png],2),/three/);
  assert.match(validateReportImages([{type:'image/png',size:5242881}]),/5 MB/);
  await assert.rejects(()=>checkImageFiles([new File(['fake'],'photo.png',{type:'image/png'})]),/format/);
  assert.match(validateReportImages([{type:'image/svg+xml',size:100}]),/JPG/);
});
