-- Run this once in the Supabase SQL Editor if your `employees` and
-- `attendance` tables already exist (i.e. you deployed before the
-- "แยกรายงานตามสาขา" feature was added). Safe to re-run — every
-- statement is idempotent.

alter table employees add column if not exists branch text;
alter table attendance add column if not exists branch text;

create index if not exists attendance_branch_idx on attendance (branch);

-- Optional: if you want a quick starting point, copy the existing
-- department text into branch so nothing prints blank until you edit
-- each employee's branch individually from the admin panel.
-- update employees set branch = department where branch is null;
