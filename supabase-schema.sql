-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)

create table if not exists employees (
  emp_id     text primary key,
  name       text not null,
  department text not null,
  branch     text,                    -- สาขาที่สังกัด แยกจาก "แผนก" เพื่อให้ออกรายงานแยกรายสาขาได้
  pin        text not null,
  status     text not null default 'Active'
);

create table if not exists locations (
  loc_id   text primary key,
  loc_name text not null,
  lat      double precision not null,
  lng      double precision not null,
  radius   integer not null default 100
);

create table if not exists attendance (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  emp_id      text not null,
  name        text not null,
  department  text not null,
  branch      text,                    -- คัดลอกมาจาก employees.branch ตอนลงเวลา ใช้กรองรายงานรายสาขา
  type        text not null,           -- 'เข้างาน' or 'ออกงาน'
  loc_name    text,
  distance    integer,
  lat         double precision,
  lng         double precision,
  photo_url   text,
  note        text
);

create index if not exists attendance_emp_id_idx on attendance (emp_id);
create index if not exists attendance_created_at_idx on attendance (created_at);
create index if not exists attendance_branch_idx on attendance (branch);

-- Admin accounts for the real login page (app/api/admin/login). Passwords
-- are hashed with bcrypt in the Next.js API route before being stored here
-- — this table never holds a plaintext password. There is deliberately no
-- self-service signup route; admins are added by an existing admin (via
-- SQL, or a future "add admin" screen) so a stranger can never create
-- their own admin account.
create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Seed data matching the original demo defaults (safe to skip/edit)
insert into employees (emp_id, name, department, pin, status)
values ('1001', 'กิตติศักดิ์ มีสุข', 'ฝ่ายปฏิบัติการ สาขาสีลม', '1234', 'Active')
on conflict (emp_id) do nothing;

insert into locations (loc_id, loc_name, lat, lng, radius)
values ('LOC_BANGKOK', 'สำนักงานใหญ่ กรุงเทพฯ', 13.7563, 100.5018, 100)
on conflict (loc_id) do nothing;

-- Row Level Security: all reads/writes in this app go through Next.js API
-- routes using the SERVICE ROLE key (server-only, never exposed to the
-- browser), which bypasses RLS entirely. Enabling RLS with no policies
-- below simply blocks the anon/public key from touching these tables
-- directly, which is what we want.
alter table employees enable row level security;
alter table locations enable row level security;
alter table attendance enable row level security;

-- ---------------------------------------------------------------------
-- Storage bucket for selfies
-- ---------------------------------------------------------------------
-- Create this in the dashboard: Storage → New bucket → name "selfies" →
-- Public bucket = ON. (The service role key used by the API routes can
-- upload regardless of bucket policy, but the bucket must be Public so
-- the generated photo URLs are viewable in the dashboard.)
