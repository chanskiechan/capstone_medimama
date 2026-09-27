# MediMama Supabase database

1. Create a Supabase project.
2. Open **SQL Editor** and run `migrations/001_initial_schema.sql` in full.
3. Create the first user in **Authentication > Users**.
4. Promote that user's profile to admin in SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'AUTH_USER_UUID_HERE';
```

5. Keep the **service role** key only in the future Node.js server environment file. Do not put it in the React app or commit it to Git.

The schema enables Row Level Security. Mothers and approved caregivers can read only linked patient data; administrative clinical writes must go through an admin session or the Node backend.
