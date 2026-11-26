-- Jalankan di Supabase SQL Editor satu kali.
create table if not exists public.nomerin_orders (
  id bigserial primary key,
  nomerin_order_id bigint not null unique,
  external_id text,
  status text not null default 'processing',
  service_id bigint,
  service_code text,
  service_name text,
  country_id bigint,
  country_code text,
  country_name text,
  price integer not null default 0,
  phone_number text,
  otp_code text,
  last_event text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nomerin_orders_external_id_idx
  on public.nomerin_orders (external_id);
create index if not exists nomerin_orders_status_idx
  on public.nomerin_orders (status);

create table if not exists public.nomerin_webhook_events (
  id bigserial primary key,
  delivery_id text unique,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

-- Akses tabel hanya melalui backend menggunakan Supabase Secret Key.
alter table public.nomerin_orders enable row level security;
alter table public.nomerin_webhook_events enable row level security;
