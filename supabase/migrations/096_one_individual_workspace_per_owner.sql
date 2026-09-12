-- ============================================================
-- 096 — BİR SAHİBE BİR BİREYSEL ÇALIŞMA ALANI (KISIT)
--
-- 095 kararı fonksiyona koydu; bu dosya son sözü veritabanına veriyor.
-- Ayrı dosya olmasının sebebi: bu indeks, veride ÇİFT KAYIT VARSA
-- oluşmaz ve migration hata verir. 095'in içinde kalsaydı fonksiyon
-- düzeltmesi de birlikte geri alınır, yani asıl yama hiç yayına
-- çıkmazdı. Sıralama böylece "önce kanamayı durdur, sonra kilidi vur".
--
-- NEDEN KISIT DA GEREKLİ: 095'teki SELECT kontrolü, iki istek aynı anda
-- (ikisi de commit etmeden) geldiğinde ikisine de "alan yok" der.
-- Kontrol tek başına yarışı kapatmaz.
-- ============================================================

-- KISMİ İNDEKS: yalnız bireysel, kütüphane olmayan alanlar için. Kurum
-- tipleri ve kütüphane bu kuralın dışında kalır.
--
-- Bu indeks MEVCUT ÇİFT KAYIT VARSA OLUŞMAZ ve migration hata verir.
-- Bu bilinçli: sessizce atlamak, temizlenmemiş çiftin üstünü örtmek
-- olurdu. Hata alındığında aşağıdaki sorgu çakışan profilleri verir:
--
--   SELECT owner_profile_id, count(*), array_agg(name)
--   FROM public.workspaces
--   WHERE type = 'individual' AND COALESCE(is_library, FALSE) = FALSE
--   GROUP BY owner_profile_id HAVING count(*) > 1;
--
-- Fazlalık alan elle incelenip silindikten (ya da type'ı değiştirildikten)
-- sonra migration tekrar çalıştırılır.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_one_individual_per_owner
  ON public.workspaces (owner_profile_id)
  WHERE type = 'individual' AND COALESCE(is_library, FALSE) = FALSE;
