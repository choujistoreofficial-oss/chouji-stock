-- CHOUJI STORE: tambahan status garansi untuk struk / cek transaksi
-- Jalankan seluruh script ini di Supabase SQL Editor.

ALTER TABLE public.pesanan
  ADD COLUMN IF NOT EXISTS garansi TEXT NOT NULL DEFAULT 'Tidak ada garansi';

-- Nilai yang digunakan panel admin: Aktif, Terpakai, Tidak ada garansi.
ALTER TABLE public.pesanan
  DROP CONSTRAINT IF EXISTS pesanan_garansi_check;
ALTER TABLE public.pesanan
  ADD CONSTRAINT pesanan_garansi_check
  CHECK (garansi IN ('Aktif', 'Terpakai', 'Tidak ada garansi'));

-- Fungsi lama perlu dihapus dahulu karena struktur hasil RPC bertambah satu kolom.
DROP FUNCTION IF EXISTS public.cek_pesanan_chouji(TEXT);

CREATE FUNCTION public.cek_pesanan_chouji(p_id_pesanan TEXT)
RETURNS TABLE (
  id_pesanan TEXT,
  produk TEXT,
  nama_pesanan TEXT,
  dibuat_pada TIMESTAMPTZ,
  kadaluarsa_pada TIMESTAMPTZ,
  garansi TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id_pesanan, p.produk, p.nama_pesanan,
         p.dibuat_pada, p.kadaluarsa_pada, p.garansi
  FROM public.pesanan p
  WHERE p.id_pesanan = p_id_pesanan
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.cek_pesanan_chouji(TEXT)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
