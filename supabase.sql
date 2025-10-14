-- Run this in Supabase SQL editor
create extension if not exists pgcrypto; -- for gen_random_uuid

create table if not exists public.jerseys (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  edition text not null check (edition in ('Icon','Statement','Association','City')),
  size text not null,
  qty_inventory int not null default 0,
  qty_due_lva int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.settings (
  id int primary key default 1,
  low_stock_threshold int not null default 1
);

alter table public.jerseys enable row level security;
alter table public.settings enable row level security;

-- Create policies idempotently (Postgres doesn't support IF NOT EXISTS for policies)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'jerseys' and policyname = 'jerseys read'
  ) then
    create policy "jerseys read" on public.jerseys for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'jerseys' and policyname = 'jerseys write'
  ) then
    create policy "jerseys write" on public.jerseys for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'settings' and policyname = 'settings read'
  ) then
    create policy "settings read" on public.settings for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'settings' and policyname = 'settings write'
  ) then
    create policy "settings write" on public.settings for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Call logs for Voiceflow integration
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_name text not null,
  edition text not null,
  size text not null,
  status text not null check (status in ('initiated', 'in_progress', 'completed', 'failed', 'cancelled')),
  duration_seconds integer,
  voiceflow_session_id text,
  transcript text,
  order_placed boolean default false,
  order_details jsonb,
  error_message text,
  initiated_by text
);

-- Inventory alerts for notifications
create table if not exists public.inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  jersey_id uuid references public.jerseys(id) on delete cascade,
  alert_type text not null check (alert_type in ('low_stock', 'out_of_stock', 'reorder_needed')),
  threshold_value integer,
  current_value integer,
  resolved boolean default false,
  resolved_at timestamptz,
  resolved_by text
);

-- User preferences and settings
create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_email text not null unique,
  notification_preferences jsonb default '{"email": true, "browser": true, "low_stock_threshold": 1}',
  dashboard_settings jsonb default '{"default_view": "dashboard", "items_per_page": 25}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Analytics and reporting
create table if not exists public.inventory_analytics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  total_jerseys integer not null,
  low_stock_count integer not null,
  total_value numeric(10,2) not null,
  orders_placed integer default 0,
  calls_made integer default 0,
  created_at timestamptz not null default now()
);

-- Enable RLS for all new tables
alter table public.call_logs enable row level security;
alter table public.inventory_alerts enable row level security;
alter table public.user_preferences enable row level security;
alter table public.inventory_analytics enable row level security;

-- Create policies for call_logs
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='call_logs' and policyname='call_logs read'
  ) then
    create policy "call_logs read" on public.call_logs for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='call_logs' and policyname='call_logs write'
  ) then
    create policy "call_logs write" on public.call_logs for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Create policies for inventory_alerts
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inventory_alerts' and policyname='inventory_alerts read'
  ) then
    create policy "inventory_alerts read" on public.inventory_alerts for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inventory_alerts' and policyname='inventory_alerts write'
  ) then
    create policy "inventory_alerts write" on public.inventory_alerts for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Create policies for user_preferences
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_preferences' and policyname='user_preferences read'
  ) then
    create policy "user_preferences read" on public.user_preferences for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_preferences' and policyname='user_preferences write'
  ) then
    create policy "user_preferences write" on public.user_preferences for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Create policies for inventory_analytics
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inventory_analytics' and policyname='inventory_analytics read'
  ) then
    create policy "inventory_analytics read" on public.inventory_analytics for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inventory_analytics' and policyname='inventory_analytics write'
  ) then
    create policy "inventory_analytics write" on public.inventory_analytics for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Create indexes for better performance
create index if not exists idx_call_logs_created_at on public.call_logs(created_at desc);
create index if not exists idx_call_logs_status on public.call_logs(status);
create index if not exists idx_inventory_alerts_resolved on public.inventory_alerts(resolved);
create index if not exists idx_inventory_alerts_jersey_id on public.inventory_alerts(jersey_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_action on public.activity_logs(action);
create index if not exists idx_inventory_analytics_date on public.inventory_analytics(date);

-- Create function to automatically create user preferences
create or replace function create_user_preferences()
returns trigger as $$
begin
  insert into public.user_preferences (user_email)
  values (new.email)
  on conflict (user_email) do nothing;
  return new;
end;
$$ language plpgsql;

-- Create trigger for automatic user preferences creation
drop trigger if exists create_user_preferences_trigger on auth.users;
create trigger create_user_preferences_trigger
  after insert on auth.users
  for each row execute function create_user_preferences();

insert into public.settings (id, low_stock_threshold) values (1, 1)
on conflict (id) do nothing;

-- Activity logs
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor text,
  action text not null,
  details jsonb
);

alter table public.activity_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='activity_logs' and policyname='logs read'
  ) then
    create policy "logs read" on public.activity_logs for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='activity_logs' and policyname='logs write'
  ) then
    create policy "logs write" on public.activity_logs for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Call logs for Voiceflow integration
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_name text not null,
  edition text not null,
  size text not null,
  status text not null check (status in ('initiated', 'in_progress', 'completed', 'failed', 'cancelled')),
  duration_seconds integer,
  voiceflow_session_id text,
  transcript text,
  order_placed boolean default false,
  order_details jsonb,
  error_message text,
  initiated_by text
);

-- Inventory alerts for notifications
create table if not exists public.inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  jersey_id uuid references public.jerseys(id) on delete cascade,
  alert_type text not null check (alert_type in ('low_stock', 'out_of_stock', 'reorder_needed')),
  threshold_value integer,
  current_value integer,
  resolved boolean default false,
  resolved_at timestamptz,
  resolved_by text
);

-- User preferences and settings
create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_email text not null unique,
  notification_preferences jsonb default '{"email": true, "browser": true, "low_stock_threshold": 1}',
  dashboard_settings jsonb default '{"default_view": "dashboard", "items_per_page": 25}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Analytics and reporting
create table if not exists public.inventory_analytics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  total_jerseys integer not null,
  low_stock_count integer not null,
  total_value numeric(10,2) not null,
  orders_placed integer default 0,
  calls_made integer default 0,
  created_at timestamptz not null default now()
);

-- Enable RLS for all new tables
alter table public.call_logs enable row level security;
alter table public.inventory_alerts enable row level security;
alter table public.user_preferences enable row level security;
alter table public.inventory_analytics enable row level security;

-- Create policies for call_logs
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='call_logs' and policyname='call_logs read'
  ) then
    create policy "call_logs read" on public.call_logs for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='call_logs' and policyname='call_logs write'
  ) then
    create policy "call_logs write" on public.call_logs for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Create policies for inventory_alerts
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inventory_alerts' and policyname='inventory_alerts read'
  ) then
    create policy "inventory_alerts read" on public.inventory_alerts for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inventory_alerts' and policyname='inventory_alerts write'
  ) then
    create policy "inventory_alerts write" on public.inventory_alerts for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Create policies for user_preferences
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_preferences' and policyname='user_preferences read'
  ) then
    create policy "user_preferences read" on public.user_preferences for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_preferences' and policyname='user_preferences write'
  ) then
    create policy "user_preferences write" on public.user_preferences for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Create policies for inventory_analytics
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inventory_analytics' and policyname='inventory_analytics read'
  ) then
    create policy "inventory_analytics read" on public.inventory_analytics for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inventory_analytics' and policyname='inventory_analytics write'
  ) then
    create policy "inventory_analytics write" on public.inventory_analytics for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Create indexes for better performance
create index if not exists idx_call_logs_created_at on public.call_logs(created_at desc);
create index if not exists idx_call_logs_status on public.call_logs(status);
create index if not exists idx_inventory_alerts_resolved on public.inventory_alerts(resolved);
create index if not exists idx_inventory_alerts_jersey_id on public.inventory_alerts(jersey_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_action on public.activity_logs(action);
create index if not exists idx_inventory_analytics_date on public.inventory_analytics(date);

-- Create function to automatically create user preferences
create or replace function create_user_preferences()
returns trigger as $$
begin
  insert into public.user_preferences (user_email)
  values (new.email)
  on conflict (user_email) do nothing;
  return new;
end;
$$ language plpgsql;

-- Create trigger for automatic user preferences creation
drop trigger if exists create_user_preferences_trigger on auth.users;
create trigger create_user_preferences_trigger
  after insert on auth.users
  for each row execute function create_user_preferences();


