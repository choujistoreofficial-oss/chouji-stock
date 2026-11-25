-- Jalankan sekali di Supabase Dashboard > SQL Editor > New query
create table if not exists public.pesanan (
  id_pesanan text primary key,
  produk text not null,
  nama_pesanan text not null,
  dibuat_pada timestamptz not null default now(),
  kadaluarsa_pada timestamptz null
);

alter table public.pesanan enable row level security;

-- Admin terverifikasi dapat mengelola data pesanan dari panel admin.
drop policy if exists "Admin kelola pesanan CHOUJI" on public.pesanan;
create policy "Admin kelola pesanan CHOUJI"
on public.pesanan
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.pesanan to authenticated;

-- Pengunjung hanya dapat mencari satu pesanan berdasarkan ID, bukan membaca seluruh tabel.
create or replace function public.cek_pesanan_chouji(p_id_pesanan text)
returns table (
  id_pesanan text,
  produk text,
  nama_pesanan text,
  dibuat_pada timestamptz,
  kadaluarsa_pada timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id_pesanan, p.produk, p.nama_pesanan, p.dibuat_pada, p.kadaluarsa_pada
  from public.pesanan p
  where p.id_pesanan = p_id_pesanan
  limit 1;
$$;

revoke all on function public.cek_pesanan_chouji(text) from public;
grant execute on function public.cek_pesanan_chouji(text) to anon, authenticated;
