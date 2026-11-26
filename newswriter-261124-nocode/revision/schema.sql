create table public.grade6_newsroom_revision_261127 (
 original_id bigint not null,
 original_revision integer not null,
 feedback jsonb not null default '{}'::jsonb,
 published boolean not null default false,
 revised_fields jsonb not null default '{}'::jsonb,
 reflection text not null default '',
 version integer not null default 0,
 status text not null default 'draft' check (status in ('draft','submitted')),
 updated_at timestamptz not null default now(),
 primary key(original_id,original_revision)
);
alter table public.grade6_newsroom_revision_261127 enable row level security;
revoke all on public.grade6_newsroom_revision_261127 from public, anon, authenticated;
grant select, insert, update on public.grade6_newsroom_revision_261127 to service_role;