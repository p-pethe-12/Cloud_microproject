create extension if not exists pgcrypto with schema extensions;

alter table public.complaints add column if not exists proof_image_url text;

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

grant execute on function public.app_take_complaint_action(text, uuid, text, text, text, text) to anon, authenticated;

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
