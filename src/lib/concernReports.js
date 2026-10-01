export const reportCategories = ['Maternal health', 'Infant health', 'Post-vaccination'];
export const reportStatuses = ['Open', 'Under review', 'Resolved'];
export const imageLimit = 3;
export const imageSizeLimit = 5 * 1024 * 1024;
export function validateReport(values, patients, now = Date.now()) {
  if (!patients.some(p => p.id === values.patient)) return 'Choose a linked patient.';
  if (!reportCategories.includes(values.category)) return 'Choose a report topic.';
  if (!values.subject?.trim() || values.subject.trim().length > 160) return 'Enter a subject up to 160 characters.';
  if (!values.description?.trim() || values.description.trim().length > 3000) return 'Enter a description up to 3000 characters.';
  if (values.started_at && (!Number.isFinite(Date.parse(`${values.started_at}:00+08:00`)) || Date.parse(`${values.started_at}:00+08:00`) > now)) return 'The symptom start must not be in the future.';
  if (values.vaccination_date && Date.parse(`${values.vaccination_date}T00:00:00+08:00`) > now) return 'The vaccination date must not be in the future.';
  return '';
}
export function validateReportImages(files, existing = 0) {
  if (files.length + existing > imageLimit) return 'Choose up to three photos per report.';
  if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) return 'Use JPG, PNG or WebP photos.';
  if (files.some(file => file.size > imageSizeLimit || file.size === 0)) return 'Each photo must be non-empty and no larger than 5 MB.';
  return '';
}
export async function checkImageFiles(files, existing = 0) {
  const problem = validateReportImages(files, existing);
  if (problem) throw Error(problem);
  for (const file of files) {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
      : String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!valid) throw Error(`${file.name}: this file does not match its photo format.`);
  }
}
export const reportReference = id => `RPT-${id.slice(0,8).toUpperCase()}`;
