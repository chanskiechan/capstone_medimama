-- Care requests use two clear workflow states: Under review and Resolved.
-- Existing Open requests remain active and are moved to Under review.
begin;

update public.health_concerns
   set status = 'Under review'
 where status = 'Open';

alter table public.health_concerns
  drop constraint if exists health_concerns_status_check;

alter table public.health_concerns
  add constraint health_concerns_status_check
  check (status in ('Under review', 'Resolved'));

alter table public.health_concerns
  alter column status set default 'Under review';

drop policy if exists "concerns submit" on public.health_concerns;
create policy "concerns submit" on public.health_concerns
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = 'Under review'
    and response = ''
    and reviewed_by is null
    and (public.can_access_mother(mother_id) or public.can_access_infant(infant_id))
  );

create or replace function public.reply_to_concern(target uuid, message_body text, next_status text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare report public.health_concerns; message_id uuid; staff boolean:=public.is_admin();
begin
 select * into report from public.health_concerns where id=target for update;
 if not found or not public.can_read_concern(target) then raise exception 'Report is not available to this account'; end if;
 if not staff and next_status is not null then raise exception 'Only health workers can change report status'; end if;
 if next_status is not null and next_status not in ('Under review','Resolved') then raise exception 'Invalid status'; end if;
 if char_length(trim(coalesce(message_body,''))) not between 1 and 3000 then raise exception 'Write a reply between 1 and 3000 characters'; end if;
 insert into public.concern_messages(concern_id,author_id,author_name,author_role,body)
 select target,id,full_name,role::text,trim(message_body) from public.profiles where id=auth.uid() returning id into message_id;
 update public.health_concerns set status=case when staff then coalesce(next_status,'Under review') when status='Resolved' then 'Under review' else status end,
   reviewed_by=case when staff then auth.uid() else reviewed_by end where id=target;
 if staff then
   insert into public.notifications(user_id,source_key,message,link_path) values(report.author_id,'concern-message:'||message_id,'A health worker replied to your report.','/support/concerns?report='||target);
 else
   insert into public.notifications(user_id,source_key,message,link_path) select id,'concern-message:'||message_id,'A family member added a follow-up to a report.','/reports?report='||target from public.profiles where role='admin';
 end if;
 return message_id;
end; $$;

revoke all on function public.reply_to_concern(uuid,text,text) from public,anon;
grant execute on function public.reply_to_concern(uuid,text,text) to authenticated;

commit;
