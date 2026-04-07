truncate table public.complaint_status_history restart identity cascade;
truncate table public.complaints restart identity cascade;
truncate table public.app_sessions restart identity cascade;
truncate table public.app_users restart identity cascade;
truncate table public.panchayat_departments restart identity cascade;
truncate table public.department_catalog restart identity cascade;
truncate table public.panchayats restart identity cascade;
truncate table public.districts restart identity cascade;
alter sequence public.complaint_code_seq restart with 1001;

insert into public.districts(name)
values ('Nagpur');

insert into public.panchayats(district_id, name, code)
select d.id, x.name, x.code
from public.districts d
cross join (
  values
    ('Saoner', 'SAONER'),
    ('Ramtek', 'RAMTEK'),
    ('Katol', 'KATOL'),
    ('Kalmeshwar', 'KALMESHWAR'),
    ('Kamptee', 'KAMPTEE')
) as x(name, code)
where d.name = 'Nagpur';

insert into public.department_catalog(name)
values
  ('Electricity'),
  ('Water Supply'),
  ('Roads'),
  ('Sanitation'),
  ('Street Lights'),
  ('Drainage'),
  ('Garbage Collection'),
  ('Agriculture'),
  ('Health'),
  ('Education');

insert into public.panchayat_departments(panchayat_id, department_id)
select p.id, d.id
from public.panchayats p
cross join public.department_catalog d;

insert into public.app_users(full_name, email, phone, role, district_id, password_hash)
select
  'Nagpur District Officer',
  'district.nagpur@nagpur.local',
  '9000000000',
  'district_officer',
  d.id,
  extensions.crypt('Nagpur@123', extensions.gen_salt('bf'))
from public.districts d
where d.name = 'Nagpur';

insert into public.app_users(full_name, email, phone, role, district_id, panchayat_id, password_hash)
select
  p.name || ' Panchayat Admin',
  'admin.' || lower(replace(p.name, ' ', '-')) || '@nagpur.local',
  '9000000001',
  'panchayat_admin',
  p.district_id,
  p.id,
  extensions.crypt('Nagpur@123', extensions.gen_salt('bf'))
from public.panchayats p;

insert into public.app_users(full_name, email, phone, role, district_id, panchayat_id, panchayat_department_id, password_hash)
select
  dc.name || ' Officer - ' || p.name,
  lower(replace(dc.name, ' ', '-')) || '.' || lower(replace(p.name, ' ', '-')) || '@nagpur.local',
  '9000000002',
  'department_officer',
  p.district_id,
  p.id,
  pd.id,
  extensions.crypt('Nagpur@123', extensions.gen_salt('bf'))
from public.panchayats p
join public.panchayat_departments pd on pd.panchayat_id = p.id
join public.department_catalog dc on dc.id = pd.department_id;

insert into public.app_users(full_name, email, phone, role, district_id, panchayat_id, password_hash)
select
  x.full_name,
  x.email,
  x.phone,
  'citizen',
  p.district_id,
  p.id,
  extensions.crypt('Citizen@123', extensions.gen_salt('bf'))
from (
  values
    ('Saoner Citizen One', 'citizen.saoner.1@nagpur.local', '9011111111', 'Saoner'),
    ('Saoner Citizen Two', 'citizen.saoner.2@nagpur.local', '9011111112', 'Saoner'),
    ('Ramtek Citizen One', 'citizen.ramtek.1@nagpur.local', '9022222221', 'Ramtek'),
    ('Katol Citizen One', 'citizen.katol.1@nagpur.local', '9033333331', 'Katol'),
    ('Kalmeshwar Citizen One', 'citizen.kalmeshwar.1@nagpur.local', '9044444441', 'Kalmeshwar'),
    ('Kamptee Citizen One', 'citizen.kamptee.1@nagpur.local', '9055555551', 'Kamptee')
) as x(full_name, email, phone, panchayat_name)
join public.panchayats p on p.name = x.panchayat_name;

with seed_complaints as (
  select * from (
    values
      ('Street lights off near bus stand', 'Three street lights have stopped working near the Saoner bus stand.', 'High', 'Street Lights', 'Bus Stand Road, Saoner', 21.386100, 78.921200, 'Saoner', 'citizen.saoner.1@nagpur.local', 'Submitted', 'Citizen submitted the complaint'),
      ('Drain overflow in ward 3', 'Drainage water is overflowing in ward 3 after light rain.', 'Medium', 'Drainage', 'Ward 3, Saoner', 21.384400, 78.919300, 'Saoner', 'citizen.saoner.2@nagpur.local', 'Approved', 'Forwarded by Saoner panchayat admin'),
      ('Broken water pipeline near school', 'A pipeline leak near the Ramtek school is wasting water all day.', 'Critical', 'Water Supply', 'School Road, Ramtek', 21.395500, 79.327000, 'Ramtek', 'citizen.ramtek.1@nagpur.local', 'Acknowledged', 'Department acknowledged the complaint'),
      ('Garbage collection delay', 'Garbage has not been collected in Katol market area for five days.', 'High', 'Garbage Collection', 'Market Road, Katol', 21.273200, 78.585500, 'Katol', 'citizen.katol.1@nagpur.local', 'Resolved', 'Garbage cleared and route normalised'),
      ('School toilet sanitation issue', 'The girls school sanitation block needs urgent cleaning in Kalmeshwar.', 'Medium', 'Sanitation', 'Girls School, Kalmeshwar', 21.232000, 78.914900, 'Kalmeshwar', 'citizen.kalmeshwar.1@nagpur.local', 'Rejected', 'Complaint rejected because duplicate ticket already exists'),
      ('Road potholes on main stretch', 'Large potholes near the Kamptee market are causing traffic jams.', 'High', 'Roads', 'Main Market Road, Kamptee', 21.216900, 79.200700, 'Kamptee', 'citizen.kamptee.1@nagpur.local', 'Approved', 'Forwarded by Kamptee panchayat admin')
  ) as t(title, description, priority, department_name, address, latitude, longitude, panchayat_name, citizen_email, status, note)
), inserted as (
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
    approved_by,
    acknowledged_by,
    resolved_by,
    rejection_reason,
    resolution_note,
    last_status_note
  )
  select
    null,
    citizen.id,
    p.district_id,
    p.id,
    dc.id,
    pd.id,
    s.title,
    s.description,
    s.priority,
    s.status,
    s.address,
    s.latitude,
    s.longitude,
    case when s.status in ('Approved', 'Acknowledged', 'Resolved') then admin_user.id else null end,
    case when s.status in ('Acknowledged', 'Resolved') then dept_user.id else null end,
    case when s.status = 'Resolved' then dept_user.id else null end,
    case when s.status = 'Rejected' then s.note else null end,
    case when s.status = 'Resolved' then s.note else null end,
    s.note
  from seed_complaints s
  join public.panchayats p on p.name = s.panchayat_name
  join public.department_catalog dc on dc.name = s.department_name
  join public.panchayat_departments pd on pd.panchayat_id = p.id and pd.department_id = dc.id
  join public.app_users citizen on citizen.email = s.citizen_email
  left join public.app_users admin_user on admin_user.email = 'admin.' || lower(replace(p.name, ' ', '-')) || '@nagpur.local'
  left join public.app_users dept_user on dept_user.email = lower(replace(dc.name, ' ', '-')) || '.' || lower(replace(p.name, ' ', '-')) || '@nagpur.local'
  returning id, status, citizen_id, approved_by, acknowledged_by, resolved_by, last_status_note
)
insert into public.complaint_status_history(complaint_id, status, note, actor_user_id)
select
  id,
  status,
  last_status_note,
  coalesce(resolved_by, acknowledged_by, approved_by, citizen_id)
from inserted;

