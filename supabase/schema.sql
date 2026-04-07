create extension if not exists pgcrypto with schema extensions;

create sequence if not exists public.complaint_code_seq start 1001;

create table if not exists public.districts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.panchayats (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.districts(id) on delete cascade,
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now(),
  unique (district_id, name)
);

create table if not exists public.department_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.panchayat_departments (
  id uuid primary key default gen_random_uuid(),
  panchayat_id uuid not null references public.panchayats(id) on delete cascade,
  department_id uuid not null references public.department_catalog(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (panchayat_id, department_id)
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text,
  role text not null check (role in ('citizen', 'panchayat_admin', 'department_officer', 'district_officer')),
  district_id uuid references public.districts(id) on delete set null,
  panchayat_id uuid references public.panchayats(id) on delete set null,
  panchayat_department_id uuid references public.panchayat_departments(id) on delete set null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_code text not null unique,
  citizen_id uuid not null references public.app_users(id) on delete cascade,
  district_id uuid not null references public.districts(id) on delete cascade,
  panchayat_id uuid not null references public.panchayats(id) on delete cascade,
  department_catalog_id uuid not null references public.department_catalog(id) on delete restrict,
  panchayat_department_id uuid not null references public.panchayat_departments(id) on delete restrict,
  title text not null,
  description text not null,
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Critical')),
  status text not null check (status in ('Submitted', 'Approved', 'Acknowledged', 'Resolved', 'Rejected')),
  address text not null,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  approved_by uuid references public.app_users(id) on delete set null,
  acknowledged_by uuid references public.app_users(id) on delete set null,
  resolved_by uuid references public.app_users(id) on delete set null,
  rejection_reason text,
  resolution_note text,
  proof_image_url text,
  last_status_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaint_status_history (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  status text not null,
  note text,
  actor_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.app_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.app_set_complaint_code()
returns trigger
language plpgsql
as $$
begin
  if new.complaint_code is null or new.complaint_code = '' then
    new.complaint_code := 'NAG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.complaint_code_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.app_touch_updated_at();

drop trigger if exists trg_complaints_updated_at on public.complaints;
create trigger trg_complaints_updated_at
before update on public.complaints
for each row execute function public.app_touch_updated_at();

drop trigger if exists trg_complaints_code on public.complaints;
create trigger trg_complaints_code
before insert on public.complaints
for each row execute function public.app_set_complaint_code();

create or replace function public.app_role_label(p_role text)
returns text
language sql
immutable
as $$
  select case p_role
    when 'citizen' then 'Citizen'
    when 'panchayat_admin' then 'Panchayat Admin'
    when 'department_officer' then 'Department Officer'
    when 'district_officer' then 'District Officer'
    else p_role
  end;
$$;

create or replace function public.app_user_payload(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', u.id,
    'full_name', u.full_name,
    'email', u.email,
    'phone', u.phone,
    'role', u.role,
    'role_label', public.app_role_label(u.role),
    'district_name', d.name,
    'panchayat_name', p.name,
    'department_name', dc.name
  )
  from public.app_users u
  left join public.districts d on d.id = u.district_id
  left join public.panchayats p on p.id = u.panchayat_id
  left join public.panchayat_departments pd on pd.id = u.panchayat_department_id
  left join public.department_catalog dc on dc.id = pd.department_id
  where u.id = p_user_id;
$$;

create or replace function public.app_private_resolve_session(p_token text)
returns public.app_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
begin
  select u.*
  into v_user
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token = p_token
    and s.revoked_at is null
    and s.expires_at > now()
    and u.is_active = true;

  if v_user.id is null then
    raise exception 'Invalid or expired session';
  end if;

  return v_user;
end;
$$;

create or replace function public.app_complaint_payload(p_complaint_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'complaint_code', c.complaint_code,
    'title', c.title,
    'description', c.description,
    'priority', c.priority,
    'status', c.status,
    'address', c.address,
    'latitude', c.latitude,
    'longitude', c.longitude,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'department_name', dc.name,
    'panchayat_name', p.name,
    'citizen_name', citizen.full_name,
    'last_status_note', c.last_status_note,
    'proof_image_url', c.proof_image_url
  )
  from public.complaints c
  join public.department_catalog dc on dc.id = c.department_catalog_id
  join public.panchayats p on p.id = c.panchayat_id
  join public.app_users citizen on citizen.id = c.citizen_id
  where c.id = p_complaint_id;
$$;

create or replace function public.app_public_bootstrap()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'district', (select row_to_json(d) from (select id, name from public.districts where name = 'Nagpur' limit 1) d),
    'panchayats', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'district_name', d.name) order by p.name)
      from public.panchayats p
      join public.districts d on d.id = p.district_id
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
      from public.department_catalog
    ), '[]'::jsonb)
  );
$$;

create or replace function public.app_sign_in(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_token text;
begin
  select * into v_user
  from public.app_users
  where email = lower(trim(p_email));

  if v_user.id is null or v_user.password_hash <> extensions.crypt(p_password, v_user.password_hash) or v_user.is_active = false then
    raise exception 'Invalid email or password';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.app_sessions(user_id, token)
  values (v_user.id, v_token);

  return jsonb_build_object(
    'token', v_token,
    'user', public.app_user_payload(v_user.id)
  );
end;
$$;

create or replace function public.app_register_citizen(
  p_full_name text,
  p_email text,
  p_password text,
  p_phone text,
  p_panchayat_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_token text;
  v_district_id uuid;
begin
  if exists(select 1 from public.app_users where email = lower(trim(p_email))) then
    raise exception 'Email already exists';
  end if;

  select district_id into v_district_id
  from public.panchayats
  where id = p_panchayat_id;

  if v_district_id is null then
    raise exception 'Invalid panchayat';
  end if;

  insert into public.app_users(
    full_name,
    email,
    phone,
    role,
    district_id,
    panchayat_id,
    password_hash
  )
  values (
    trim(p_full_name),
    lower(trim(p_email)),
    trim(p_phone),
    'citizen',
    v_district_id,
    p_panchayat_id,
    extensions.crypt(p_password, extensions.gen_salt('bf'))
  )
  returning id into v_user_id;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.app_sessions(user_id, token) values (v_user_id, v_token);

  return jsonb_build_object(
    'token', v_token,
    'user', public.app_user_payload(v_user_id)
  );
end;
$$;

create or replace function public.app_get_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
begin
  v_user := public.app_private_resolve_session(p_token);
  return jsonb_build_object(
    'token', p_token,
    'user', public.app_user_payload(v_user.id)
  );
end;
$$;

create or replace function public.app_sign_out(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_sessions
  set revoked_at = now()
  where token = p_token
    and revoked_at is null;

  return true;
end;
$$;

create or replace function public.app_create_complaint(
  p_token text,
  p_title text,
  p_description text,
  p_priority text,
  p_department_name text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_department_id uuid;
  v_panchayat_department_id uuid;
  v_complaint_id uuid;
begin
  v_user := public.app_private_resolve_session(p_token);

  if v_user.role <> 'citizen' then
    raise exception 'Only citizens can create complaints';
  end if;

  select dc.id, pd.id
  into v_department_id, v_panchayat_department_id
  from public.department_catalog dc
  join public.panchayat_departments pd on pd.department_id = dc.id
  where dc.name = p_department_name
    and pd.panchayat_id = v_user.panchayat_id;

  if v_department_id is null or v_panchayat_department_id is null then
    raise exception 'Invalid service department for this panchayat';
  end if;

  insert into public.complaints(
    complaint_code,
    citizen_id,
    district_id,
    panchayat_id,
    department_catalog_id,
    panchayat_department_id,
    title,
    description,
    priority,
    status,
    address,
    latitude,
    longitude,
    last_status_note
  )
  values (
    null,
    v_user.id,
    v_user.district_id,
    v_user.panchayat_id,
    v_department_id,
    v_panchayat_department_id,
    trim(p_title),
    trim(p_description),
    p_priority,
    'Submitted',
    trim(p_address),
    p_latitude,
    p_longitude,
    'Citizen submitted the complaint'
  )
  returning id into v_complaint_id;

  insert into public.complaint_status_history(complaint_id, status, note, actor_user_id)
  values (v_complaint_id, 'Submitted', 'Citizen submitted the complaint', v_user.id);

  return public.app_complaint_payload(v_complaint_id);
end;
$$;

create or replace function public.app_take_complaint_action(
  p_token text,
  p_complaint_id uuid,
  p_action text,
  p_note text default null,
  p_department_name text default null,
  p_proof_image_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_complaint public.complaints;
  v_department_id uuid;
  v_panchayat_department_id uuid;
  v_next_status text;
  v_note text;
begin
  v_user := public.app_private_resolve_session(p_token);

  select * into v_complaint
  from public.complaints
  where id = p_complaint_id;

  if v_complaint.id is null then
    raise exception 'Complaint not found';
  end if;

  if p_action = 'approve' then
    if v_user.role <> 'panchayat_admin' or v_complaint.panchayat_id <> v_user.panchayat_id or v_complaint.status <> 'Submitted' then
      raise exception 'You cannot approve this complaint';
    end if;

    if p_department_name is not null then
      select dc.id, pd.id
      into v_department_id, v_panchayat_department_id
      from public.department_catalog dc
      join public.panchayat_departments pd on pd.department_id = dc.id
      where dc.name = p_department_name
        and pd.panchayat_id = v_user.panchayat_id;

      if v_department_id is null then
        raise exception 'Invalid department override';
      end if;

      update public.complaints
      set department_catalog_id = v_department_id,
          panchayat_department_id = v_panchayat_department_id
      where id = v_complaint.id;
    end if;

    v_next_status := 'Approved';
    v_note := coalesce(nullif(trim(p_note), ''), 'Panchayat admin approved and forwarded the complaint');

    update public.complaints
    set status = v_next_status,
        approved_by = v_user.id,
        last_status_note = v_note,
        rejection_reason = null
    where id = v_complaint.id;
  elsif p_action = 'reject' then
    if v_user.role <> 'panchayat_admin' or v_complaint.panchayat_id <> v_user.panchayat_id or v_complaint.status <> 'Submitted' then
      raise exception 'You cannot reject this complaint';
    end if;

    v_next_status := 'Rejected';
    v_note := coalesce(nullif(trim(p_note), ''), 'Rejected by panchayat admin');

    update public.complaints
    set status = v_next_status,
        rejection_reason = v_note,
        last_status_note = v_note
    where id = v_complaint.id;
  elsif p_action = 'acknowledge' then
    if v_user.role <> 'department_officer' or v_complaint.panchayat_department_id <> v_user.panchayat_department_id or v_complaint.status <> 'Approved' then
      raise exception 'You cannot acknowledge this complaint';
    end if;

    v_next_status := 'Acknowledged';
    v_note := coalesce(nullif(trim(p_note), ''), 'Department acknowledged and started working');

    update public.complaints
    set status = v_next_status,
        acknowledged_by = v_user.id,
        last_status_note = v_note
    where id = v_complaint.id;
  elsif p_action = 'resolve' then
    if v_user.role <> 'department_officer' or v_complaint.panchayat_department_id <> v_user.panchayat_department_id or v_complaint.status not in ('Approved', 'Acknowledged') then
      raise exception 'You cannot resolve this complaint';
    end if;

    v_next_status := 'Resolved';
    v_note := coalesce(nullif(trim(p_note), ''), 'Department resolved the complaint');

    update public.complaints
    set status = v_next_status,
        resolved_by = v_user.id,
        resolution_note = v_note,
        proof_image_url = coalesce(nullif(trim(p_proof_image_url), ''), v_complaint.proof_image_url),
        last_status_note = v_note
    where id = v_complaint.id;
  else
    raise exception 'Unsupported action';
  end if;

  insert into public.complaint_status_history(complaint_id, status, note, actor_user_id)
  values (v_complaint.id, v_next_status, v_note, v_user.id);

  return public.app_complaint_payload(v_complaint.id);
end;
$$;

create or replace function public.app_get_workspace(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_stats jsonb;
  v_complaints jsonb;
  v_pending jsonb;
  v_summary jsonb;
  v_highlights jsonb;
begin
  v_user := public.app_private_resolve_session(p_token);

  with visible as (
    select
      c.id,
      c.complaint_code,
      c.title,
      c.description,
      c.priority,
      c.status,
      c.address,
      c.latitude,
      c.longitude,
      c.created_at,
      c.updated_at,
      c.last_status_note,
      c.proof_image_url,
      citizen.full_name as citizen_name,
      p.name as panchayat_name,
      dc.name as department_name
    from public.complaints c
    join public.app_users citizen on citizen.id = c.citizen_id
    join public.panchayats p on p.id = c.panchayat_id
    join public.department_catalog dc on dc.id = c.department_catalog_id
    where case
      when v_user.role = 'district_officer' then true
      when v_user.role = 'panchayat_admin' then c.panchayat_id = v_user.panchayat_id
      when v_user.role = 'department_officer' then c.panchayat_department_id = v_user.panchayat_department_id
      else c.citizen_id = v_user.id
    end
    order by c.created_at desc
  )
  select jsonb_build_object(
      'total', count(*),
      'submitted', count(*) filter (where status = 'Submitted'),
      'approved', count(*) filter (where status = 'Approved'),
      'acknowledged', count(*) filter (where status = 'Acknowledged'),
      'resolved', count(*) filter (where status = 'Resolved'),
      'rejected', count(*) filter (where status = 'Rejected')
    ),
    coalesce(jsonb_agg(to_jsonb(visible)), '[]'::jsonb)
  into v_stats, v_complaints
  from visible;

  with pending as (
    select public.app_complaint_payload(c.id) as payload
    from public.complaints c
    where c.panchayat_id = v_user.panchayat_id
      and c.status = 'Submitted'
    order by c.created_at desc
  )
  select coalesce(jsonb_agg(payload), '[]'::jsonb)
  into v_pending
  from pending;

  if v_user.role = 'district_officer' then
    with summary as (
      select
        p.name as panchayat_name,
        count(c.*) as total,
        count(*) filter (where c.status = 'Resolved') as resolved,
        count(*) filter (where c.status in ('Submitted', 'Approved', 'Acknowledged')) as pending,
        count(*) filter (where c.status = 'Rejected') as rejected
      from public.panchayats p
      left join public.complaints c on c.panchayat_id = p.id
      group by p.name
      order by p.name
    )
    select coalesce(jsonb_agg(to_jsonb(summary)), '[]'::jsonb)
    into v_summary
    from summary;

    with urgent as (
      select public.app_complaint_payload(c.id) as payload
      from public.complaints c
      where c.status <> 'Resolved'
      order by c.created_at desc
      limit 5
    )
    select coalesce(jsonb_agg(payload), '[]'::jsonb)
    into v_highlights
    from urgent;
  else
    v_summary := '[]'::jsonb;
    v_highlights := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'user', public.app_user_payload(v_user.id),
    'stats', coalesce(v_stats, '{}'::jsonb),
    'complaints', coalesce(v_complaints, '[]'::jsonb),
    'pending_complaints', coalesce(v_pending, '[]'::jsonb),
    'recent_complaints', coalesce(v_complaints, '[]'::jsonb),
    'panchayat_summary', coalesce(v_summary, '[]'::jsonb),
    'highlights', coalesce(v_highlights, '[]'::jsonb)
  );
end;
$$;

alter table public.districts enable row level security;
alter table public.panchayats enable row level security;
alter table public.department_catalog enable row level security;
alter table public.panchayat_departments enable row level security;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_status_history enable row level security;

revoke all on table public.districts from anon, authenticated;
revoke all on table public.panchayats from anon, authenticated;
revoke all on table public.department_catalog from anon, authenticated;
revoke all on table public.panchayat_departments from anon, authenticated;
revoke all on table public.app_users from anon, authenticated;
revoke all on table public.app_sessions from anon, authenticated;
revoke all on table public.complaints from anon, authenticated;
revoke all on table public.complaint_status_history from anon, authenticated;

revoke all on function public.app_private_resolve_session(text) from public;
grant execute on function public.app_public_bootstrap() to anon, authenticated;
grant execute on function public.app_sign_in(text, text) to anon, authenticated;
grant execute on function public.app_register_citizen(text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.app_get_session(text) to anon, authenticated;
grant execute on function public.app_sign_out(text) to anon, authenticated;
grant execute on function public.app_create_complaint(text, text, text, text, text, text, numeric, numeric) to anon, authenticated;
grant execute on function public.app_take_complaint_action(text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.app_get_workspace(text) to anon, authenticated;



alter table public.complaints add column if not exists proof_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-proofs', 'complaint-proofs', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Complaint proofs are publicly readable'
  ) then
    create policy "Complaint proofs are publicly readable"
    on storage.objects
    for select
    to public
    using (bucket_id = 'complaint-proofs');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Complaint proofs can be uploaded'
  ) then
    create policy "Complaint proofs can be uploaded"
    on storage.objects
    for insert
    to anon, authenticated
    with check (bucket_id = 'complaint-proofs');
  end if;
end $$;
