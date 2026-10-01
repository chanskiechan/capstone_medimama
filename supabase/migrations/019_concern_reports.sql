-- Run once after 018 in Supabase SQL Editor. Preserves existing concerns/replies.
begin;
alter table public.health_concerns
  add column subject text not null default '' check(char_length(subject)<=160),
  add column symptoms text not null default '' check(char_length(symptoms)<=1000),
  add column started_at timestamptz,
  add column vaccine_name text not null default '' check(char_length(vaccine_name)<=120),
  add column vaccination_date date,
  add column actions_taken text not null default '' check(char_length(actions_taken)<=1000),
  add column contact_number text not null default '' check(char_length(contact_number)<=40),
  add column reporter_name text not null default '',
  add column reporter_role text not null default '';
update public.health_concerns c set subject=c.category,reporter_name=p.full_name,reporter_role=p.role::text from public.profiles p where p.id=c.author_id;

create function public.can_read_concern(target uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.health_concerns c where c.id=target and
   (public.is_admin() or (c.author_id=auth.uid() and (public.can_access_mother(c.mother_id) or public.can_access_infant(c.infant_id)))));
$$;
revoke all on function public.can_read_concern(uuid) from public,anon;
grant execute on function public.can_read_concern(uuid) to authenticated;

create function public.prepare_concern_report() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  select full_name,role::text into new.reporter_name,new.reporter_role from public.profiles where id=auth.uid();
  new.subject:=trim(new.subject);
  if new.subject='' then new.subject:=new.category; end if;
  if new.started_at>now() then raise exception 'Symptom start cannot be in the future'; end if;
  if new.vaccination_date>(now() at time zone 'Asia/Manila')::date then raise exception 'Vaccination date cannot be in the future'; end if;
  return new;
end; $$;
create trigger prepare_concern_report before insert on public.health_concerns for each row execute function public.prepare_concern_report();

create table public.concern_messages (
 id uuid primary key default gen_random_uuid(),
 concern_id uuid not null references public.health_concerns(id) on delete cascade,
 author_id uuid not null default auth.uid() references public.profiles(id),
 author_name text not null default '', author_role text not null default '',
 body text not null check(char_length(trim(body)) between 1 and 3000),
 created_at timestamptz not null default now()
);
alter table public.concern_messages enable row level security;
create policy "report conversation read" on public.concern_messages for select to authenticated using(public.can_read_concern(concern_id));
grant select on public.concern_messages to authenticated;
revoke insert,update,delete on public.concern_messages from anon,authenticated;
create index concern_messages_thread on public.concern_messages(concern_id,created_at);

alter table public.notifications add column link_path text;
create function public.reply_to_concern(target uuid, message_body text, next_status text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare report public.health_concerns; message_id uuid; staff boolean:=public.is_admin();
begin
 select * into report from public.health_concerns where id=target for update;
 if not found or not public.can_read_concern(target) then raise exception 'Report is not available to this account'; end if;
 if not staff and next_status is not null then raise exception 'Only health workers can change report status'; end if;
 if next_status is not null and next_status not in ('Open','Under review','Resolved') then raise exception 'Invalid status'; end if;
 if char_length(trim(coalesce(message_body,''))) not between 1 and 3000 then raise exception 'Write a reply between 1 and 3000 characters'; end if;
 insert into public.concern_messages(concern_id,author_id,author_name,author_role,body)
 select target,id,full_name,role::text,trim(message_body) from public.profiles where id=auth.uid() returning id into message_id;
 update public.health_concerns set status=case when staff then coalesce(next_status,'Under review') when status='Resolved' then 'Open' else status end,
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

-- Replace only concern notifications; appointment notification triggers remain unchanged.
drop trigger concern_notifications on public.health_concerns;
create function public.notify_new_concern() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(user_id,source_key,message,link_path)
 select id,'concern:'||new.id,'A new '||lower(new.category)||' report needs review.','/reports?report='||new.id from public.profiles where role='admin' on conflict do nothing;
 return new;
end; $$;
create trigger concern_notifications after insert on public.health_concerns for each row execute function public.notify_new_concern();

create table public.concern_attachments (
 id uuid primary key default gen_random_uuid(), concern_id uuid not null references public.health_concerns(id) on delete cascade,
 uploader_id uuid not null default auth.uid() references public.profiles(id),
 storage_path text not null unique, file_name text not null check(char_length(file_name) between 1 and 200),
 created_at timestamptz not null default now()
);
alter table public.concern_attachments enable row level security;
create policy "report attachments read" on public.concern_attachments for select to authenticated using(public.can_read_concern(concern_id));
create policy "report attachments add" on public.concern_attachments for insert to authenticated with check(uploader_id=auth.uid() and public.can_read_concern(concern_id) and exists(select 1 from public.health_concerns where id=concern_id and author_id=auth.uid()));
grant select,insert on public.concern_attachments to authenticated;
revoke update,delete on public.concern_attachments from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('concern-images','concern-images',false,5242880,array['image/jpeg','image/png','image/webp']);

create function public.validate_concern_attachment() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.health_concerns where id=new.concern_id for update;
 if split_part(new.storage_path,'/',1)<>auth.uid()::text or split_part(new.storage_path,'/',2)<>new.concern_id::text then raise exception 'Invalid attachment path'; end if;
 if (select count(*) from public.concern_attachments where concern_id=new.concern_id)>=3 then raise exception 'A report can have at most three photos'; end if;
 if not exists(select 1 from storage.objects where bucket_id='concern-images' and name=new.storage_path) then raise exception 'Upload the photo first'; end if;
 return new;
end; $$;
create trigger validate_concern_attachment before insert on public.concern_attachments for each row execute function public.validate_concern_attachment();

create function public.concern_image_unused(object_path text) returns boolean language sql stable security definer set search_path=public as $$
 select not exists(select 1 from public.concern_attachments where storage_path=object_path);
$$;
revoke all on function public.concern_image_unused(text) from public,anon;
grant execute on function public.concern_image_unused(text) to authenticated;
create policy "upload own report photo" on storage.objects for insert to authenticated with check(bucket_id='concern-images' and split_part(name,'/',1)=auth.uid()::text and exists(select 1 from public.health_concerns where id::text=split_part(name,'/',2) and author_id=auth.uid() and public.can_read_concern(id)));
create policy "view report photo" on storage.objects for select to authenticated using(bucket_id='concern-images' and exists(select 1 from public.concern_attachments a where a.storage_path=name and public.can_read_concern(a.concern_id)));
create policy "view own pending report upload" on storage.objects for select to authenticated using(bucket_id='concern-images' and split_part(name,'/',1)=auth.uid()::text and public.concern_image_unused(name) and exists(select 1 from public.health_concerns where id::text=split_part(name,'/',2) and author_id=auth.uid() and public.can_read_concern(id)));
create policy "remove unused report upload" on storage.objects for delete to authenticated using(bucket_id='concern-images' and split_part(name,'/',1)=auth.uid()::text and public.concern_image_unused(name));
commit;
