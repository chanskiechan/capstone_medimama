export const backupTables = ['mothers','infants','maternal_records','growth_records','vaccinations','infant_records','appointments','care_notes'];
export function validateBackup(value, project) {
  if (!value || value.format !== 'medimama-clinical' || value.version !== 1 || !value.tables || Array.isArray(value.tables)) throw Error('Choose a MediMama clinical backup file.');
  if (value.project !== project) throw Error('This backup belongs to a different Supabase project.');
  if (Object.keys(value.tables).some(key=>!backupTables.includes(key))) throw Error('The backup contains an unsupported table.');
  return backupTables.map(table=>{
    const rows=value.tables[table];
    if(!Array.isArray(rows) || rows.some(row=>!row || typeof row !== 'object' || typeof row.id !== 'string')) throw Error(`Invalid backup records: ${table}`);
    return {table,count:rows.length};
  });
}
