-- Run once after 017. Preserves caregiver records and notes.
begin;
alter table public.caregiver_requests add column archived_at timestamptz;
create or replace function public.set_caregiver_archived(request_id uuid, archive_record boolean)
returns void language plpgsql security invoker set search_path=public as $$
declare target public.caregiver_requests;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into target from public.caregiver_requests where id=request_id for update;
  if not found then raise exception 'Caregiver registration not found'; end if;
  if archive_record and target.archived_at is null then
    update public.caregiver_requests set archived_at=now(),status='pending' where id=request_id;
    update public.caregiver_assignments set status='revoked',revoked_at=now() where caregiver_id=target.caregiver_id and status<>'revoked';
  elsif not archive_record and target.archived_at is not null then
    update public.caregiver_requests set archived_at=null,status='pending',reviewed_at=null,reviewed_by=null where id=request_id;
  end if;
end; $$;
revoke all on function public.set_caregiver_archived(uuid,boolean) from public,anon;
grant execute on function public.set_caregiver_archived(uuid,boolean) to authenticated;
create function public.check_archived_caregiver_link() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='approved' and exists(select 1 from public.caregiver_requests where caregiver_id=new.caregiver_id and archived_at is not null) then
    raise exception 'Restore the caregiver registration before approving access';
  end if;
  return new;
end; $$;
create trigger archived_caregiver_link before insert or update on public.caregiver_assignments for each row execute function public.check_archived_caregiver_link();
create trigger care_audit after insert or update or delete on public.caregiver_requests for each row execute function public.record_care_audit();
commit;
