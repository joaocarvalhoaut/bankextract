alter table public.dispatch_jobs
  add column if not exists avg_ms_per_item integer,
  add column if not exists last_batch_duration_ms integer,
  add column if not exists recommended_batch_size integer not null default 20;

update public.dispatch_jobs
set recommended_batch_size = 20
where recommended_batch_size is null or recommended_batch_size < 1;

alter table public.dispatch_jobs
  drop constraint if exists dispatch_jobs_recommended_batch_size_check;

alter table public.dispatch_jobs
  add constraint dispatch_jobs_recommended_batch_size_check
  check (recommended_batch_size between 1 and 50);
