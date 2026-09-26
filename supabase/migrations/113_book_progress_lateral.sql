-- ============================================================
-- 113 — 112 YETMEDİ: FİLTRE RLS'İN ALTINA İNMİYOR
--
-- ============================================================
-- 112 NE YAPTI, NE YAPMADI
--
-- 112 fan-out ve COUNT(DISTINCT)'i kaldırdı; ölçüm iyileşme gösterdi
-- ama sorunu KAPATMADI. 112 sonrası iki kiracıda ölçüm (tek kullanıcı,
-- 8 tekrar medyanı):
--
--   Kiracı A · 3 aktif atama · RLS'in gösterdiği 20.076 test
--     TÜM book_tests sayımı (RLS taraması)   675 ms
--     student_book_progress_view             770 ms   <-- tarama kadar
--     TEK kitabın testleri (indeks yolu)      75 ms   <-- ağ tabanı
--
--   Kiracı B · 79 aktif atama · 28.228 test
--     TÜM book_tests sayımı                  381 ms
--     student_book_progress_view             160 ms   <-- filtre inmiş
--
-- Ters oran her şeyi anlatıyor: 3 atamalı kiracı, 79 atamalı kiracıdan
-- BEŞ KAT yavaş. Maliyet kiracının kendi verisinden gelmiyor.
--
-- ============================================================
-- SEBEP
--
-- 112'nin CTE'si şöyleydi:
--
--   FROM book_tests bt
--   WHERE bt.book_id IN (SELECT book_id FROM student_book_assignments
--                        WHERE status = 'active')
--   GROUP BY bt.book_id
--
-- Niyet: yalnız atanmış kitapların testlerini oku. Gerçekte olan: A'da
-- planlayıcı bu filtreyi `book_tests` taramasının ALTINA indirmiyor ve
-- 20.076 satırın tamamı okunup RLS'ten geçiriliyor — 3 kitap (75 satır)
-- için.
--
-- Neden A'da olup B'de olmuyor: `tests_select` politikası
-- `workspace_id IN (SELECT my_workspace_ids(...))` **VEYA** kütüphane
-- koşulu biçiminde. A'nın gördüğü 20.076 satırın çoğu kütüphane yolundan
-- geliyor; o dal satır başına daha pahalı ve seçici değil. B'nin
-- satırları ağırlıkla kendi çalışma alanından, o yüzden planlayıcı daha
-- iyi bir yol seçiyor. Yani DAVRANIŞ VERİ DAĞILIMINA BAĞLI —
-- güvenilmez.
--
-- ============================================================
-- ÇÖZÜM: ERİŞİMİ KİTAP BAŞINA İNDEKSE ZORLA
--
-- `JOIN LATERAL` ile alt sorgu artık atamayla KORELE: her atama için
-- `bt.book_id = sba.book_id` sabit bir indeks koşulu, yani
-- `idx_tests_book_id` üzerinden yalnız o kitabın satırları okunuyor.
-- Planlayıcının filtreyi indirmesini UMMAK yerine sorgu zaten indirmiş
-- oluyor.
--
-- Beklenen: A'da 3 indeks okuması (~75 satır), B'de 79 indeks okuması
-- (yalnız atanmış kitapların satırları). İkisinde de tüm tablo
-- taraması yok.
--
-- KORELE ALT SORGU BURADA "N+1" DEĞİL: alternatif, 20-28 bin satırı
-- okuyup atmaktı. Az sayıda indeks okuması, tabloyu baştan sona
-- taramaktan ucuz.
--
-- ============================================================
-- DAVRANIŞ YİNE BİREBİR
--
-- `kt.tum_test > 0` koşulu 112'nin (ve ondan önce 004'ün) INNER JOIN
-- davranışını koruyor: kitabında HİÇ test satırı olmayan atama
--  görünmüyor. `aktif_test` ise yalnız `status='active'` sayıyor —
-- yani "satırı var ama hiçbiri aktif değil" durumu görünür ve
-- `total_tests = 0` olur. 112 ile aynı, 004 ile aynı.
--
-- `security_invoker=on` korunuyor (049).
--
-- Migration yine iki yönlü EXCEPT ALL ile kendini denetliyor ve
-- yeniden çalıştırılabilir.
-- ============================================================

-- ------------------------------------------------------------
-- ADIM 1 — Aday tanımı geçici view olarak kur
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.student_book_progress_view_113_kontrol;

CREATE VIEW public.student_book_progress_view_113_kontrol
WITH (security_invoker = on) AS
SELECT
  sba.workspace_id,
  sba.academic_term_id,
  sba.student_id,
  sba.id                                   AS student_book_assignment_id,
  sba.book_id,
  b.title                                  AS book_title,
  b.subject,
  b.exam_type,
  b.publisher,
  sba.start_date,
  sba.target_end_date,
  sba.status                               AS assignment_status,
  kt.aktif_test                            AS total_tests,
  tam.tamamlanan                           AS completed_tests,
  kt.aktif_test - tam.tamamlanan           AS remaining_tests,
  CASE
    WHEN kt.aktif_test = 0 THEN 0::NUMERIC
    ELSE round(tam.tamamlanan::NUMERIC / kt.aktif_test::NUMERIC * 100::NUMERIC)
  END                                      AS completion_percentage,
  b.tracking_mode
FROM public.student_book_assignments sba
JOIN public.books b ON b.id = sba.book_id
-- Kitabın testleri: korele, yani idx_tests_book_id üzerinden.
JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE bt.status = 'active') AS aktif_test,
    count(*)                                    AS tum_test
  FROM public.book_tests bt
  WHERE bt.book_id = sba.book_id
) kt ON kt.tum_test > 0
-- Atamanın tamamlamaları: yine korele. `bt` üzerinden bağlanıyor çünkü
-- eski tanımın kuralı "tamamlamanın testi atamanın kitabına ait olmalı".
LEFT JOIN LATERAL (
  SELECT count(*) AS tamamlanan
  FROM public.test_completions tc
  JOIN public.book_tests bt2 ON bt2.id = tc.book_test_id
  WHERE tc.student_book_assignment_id = sba.id
    AND tc.status = 'active'
    AND bt2.book_id = sba.book_id
) tam ON true
WHERE sba.status = 'active';

-- ------------------------------------------------------------
-- ADIM 2 — EŞDEĞERLİK DENETİMİ (mevcut 112 tanımına karşı)
-- ------------------------------------------------------------
DO $dogrula$
DECLARE
  v_eski_fazla BIGINT;
  v_yeni_fazla BIGINT;
  v_toplam     BIGINT;
BEGIN
  SELECT count(*) INTO v_toplam FROM public.student_book_progress_view;

  SELECT count(*) INTO v_eski_fazla FROM (
    SELECT * FROM public.student_book_progress_view
    EXCEPT ALL
    SELECT * FROM public.student_book_progress_view_113_kontrol
  ) s;

  SELECT count(*) INTO v_yeni_fazla FROM (
    SELECT * FROM public.student_book_progress_view_113_kontrol
    EXCEPT ALL
    SELECT * FROM public.student_book_progress_view
  ) s;

  IF v_eski_fazla <> 0 OR v_yeni_fazla <> 0 THEN
    RAISE EXCEPTION
      '113 DOĞRULAMA: sonuçlar aynı değil (mevcutta fazla: %, adayda fazla: %). Geçiş YAPILMADI.',
      v_eski_fazla, v_yeni_fazla;
  END IF;

  IF v_toplam = 0 THEN
    RAISE EXCEPTION '113 DOĞRULAMA: view hiç satır döndürmedi, karşılaştırma anlamsız. Geçiş YAPILMADI.';
  END IF;

  RAISE NOTICE '113: % satırda birebir eşdeğerlik doğrulandı.', v_toplam;
END;
$dogrula$;

-- ------------------------------------------------------------
-- ADIM 3 — GEÇİŞ
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.student_book_progress_view
WITH (security_invoker = on) AS
SELECT
  sba.workspace_id,
  sba.academic_term_id,
  sba.student_id,
  sba.id                                   AS student_book_assignment_id,
  sba.book_id,
  b.title                                  AS book_title,
  b.subject,
  b.exam_type,
  b.publisher,
  sba.start_date,
  sba.target_end_date,
  sba.status                               AS assignment_status,
  kt.aktif_test                            AS total_tests,
  tam.tamamlanan                           AS completed_tests,
  kt.aktif_test - tam.tamamlanan           AS remaining_tests,
  CASE
    WHEN kt.aktif_test = 0 THEN 0::NUMERIC
    ELSE round(tam.tamamlanan::NUMERIC / kt.aktif_test::NUMERIC * 100::NUMERIC)
  END                                      AS completion_percentage,
  b.tracking_mode
FROM public.student_book_assignments sba
JOIN public.books b ON b.id = sba.book_id
JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE bt.status = 'active') AS aktif_test,
    count(*)                                    AS tum_test
  FROM public.book_tests bt
  WHERE bt.book_id = sba.book_id
) kt ON kt.tum_test > 0
LEFT JOIN LATERAL (
  SELECT count(*) AS tamamlanan
  FROM public.test_completions tc
  JOIN public.book_tests bt2 ON bt2.id = tc.book_test_id
  WHERE tc.student_book_assignment_id = sba.id
    AND tc.status = 'active'
    AND bt2.book_id = sba.book_id
) tam ON true
WHERE sba.status = 'active';

-- ------------------------------------------------------------
-- ADIM 4 — Geçici view'ı kaldır
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.student_book_progress_view_113_kontrol;

-- ------------------------------------------------------------
-- ADIM 5 — Geçişin doğrulanması
-- ------------------------------------------------------------
DO $son$
BEGIN
  IF (SELECT pg_get_viewdef('public.student_book_progress_view'::regclass, true)) NOT LIKE '%LATERAL%' THEN
    RAISE EXCEPTION '113 DOĞRULAMA: view eski tanımda kaldı.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'student_book_progress_view'
      AND c.reloptions @> ARRAY['security_invoker=on']
  ) THEN
    RAISE EXCEPTION '113 DOĞRULAMA: security_invoker kayboldu — 049''un kapattığı açık geri döner.';
  END IF;

  RAISE NOTICE '113: geçiş tamam, security_invoker yerinde.';
END;
$son$;

-- ============================================================
-- ROLLBACK — 112'nin CTE tanımına dön
--
-- 112 dosyasının ADIM 3 bloğu aynen çalıştırılır. Geri alınırsa az
-- atamalı kiracılarda panel yeniden tüm book_tests taramasını öder.
-- ============================================================
