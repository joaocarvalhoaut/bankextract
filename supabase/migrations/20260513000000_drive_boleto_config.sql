-- ─────────────────────────────────────────────────────────────────────────────
-- Drive Boleto Config: extend google_sheets_config with boleto-specific options
-- Safe: all new columns with defaults — existing rows unaffected
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.google_sheets_config
  add column if not exists drive_recursive_scan       boolean not null default false,
  add column if not exists drive_matching_strategy    text    not null default 'auto'
    check (drive_matching_strategy in ('auto', 'strict', 'fuzzy')),
  add column if not exists drive_max_depth            smallint not null default 2
    check (drive_max_depth between 1 and 5),
  add column if not exists drive_last_test_at         timestamptz,
  add column if not exists drive_last_test_status     text,
  add column if not exists drive_last_test_pdf_count  integer,
  add column if not exists drive_folder_name          text;

comment on column public.google_sheets_config.drive_recursive_scan    is 'Scan subfolders recursively when searching for boleto PDFs';
comment on column public.google_sheets_config.drive_matching_strategy is 'auto=default scoring, strict=high-confidence only, fuzzy=low threshold';
comment on column public.google_sheets_config.drive_max_depth         is 'Max recursion depth (1-5, default 2)';
comment on column public.google_sheets_config.drive_folder_name       is 'Cached friendly name of the root Drive folder';
