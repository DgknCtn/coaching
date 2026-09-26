-- ============================================================
-- 112 — PANEL ÇÖKMESİNİN KAYNAĞI: student_book_progress_view
--
-- ============================================================
-- BULGU: YÜK TESTİ (LOAD-01, 27 Eylül 2026)
--
-- 40 eşzamanlı kullanıcıda API'nin %70'i 5xx döndü ve hata kodu
-- beklenen zaman aşımı değildi:
--
--   25P02: current transaction is aborted, commands ignored until
--          end of transaction block
--
-- Zincir ölçüldü:
--   1. Panel sorgusu `authenticated` rolünün statement_timeout'unu
--      (8 sn) aşıyor, iptal ediliyor.
--   2. İçinde bulunduğu işlem ABORT durumuna düşüyor.
--   3. Pooler o bağlantıyı bir sonraki isteğe veriyor → 25P02.
--   4. Hata panelle SINIRLI KALMIYOR, tüm uçlara yayılıyor.
--
-- Kanıt: ilk hata panelde değil kitap ilerleyiş adımında göründü ve
-- 5xx oranı on adımın hepsinde ~%70'te eşitlendi.
--
-- Yani tek bir yavaş sorgu, yük altında API'nin tamamını düşürüyor.
--
-- ============================================================
-- ÖLÇÜM (tek kullanıcı, 17 öğrencili kiracı, 12 tekrar medyanı)
--
--   teacher_student_overview_view          p50  529 ms
--   student_book_progress_view             p50  331 ms   <-- baskın
--   student_weekly_homework_summary_view   p50   76 ms
--   students (referans)                    p50   84 ms
--
-- Panelin maliyetinin üçte ikisi tek bir alt view'dan geliyor.
--
-- ============================================================
-- SEBEP: FAN-OUT + COUNT(DISTINCT)
--
-- Eski tanım şuydu:
--
--   FROM student_book_assignments sba
--   JOIN books b        ON b.id = sba.book_id
--   JOIN book_tests bt  ON bt.book_id = sba.book_id          <-- fan-out
--   LEFT JOIN test_completions tc ON ... AND tc.book_test_id = bt.id
--   GROUP BY sba.workspace_id, ..., sba.id, ...
--
-- Her aktif atama için o kitabın TÜM testleri satır olarak açılıyor,
-- sonra `count(DISTINCT bt.id)` ile tekrar teke indiriliyor. `book_tests`
-- 37.302 satır; atama sayısı arttıkça çarpım büyüyor ve DISTINCT her
-- grupta sıralama/hash maliyeti ekliyor.
--
-- İNDEKS SORUNU DEĞİL — bu önce kontrol edildi. `idx_tests_book_id`,
-- `idx_tc_sba`, `idx_tc_sba_status` ve `idx_tests_workspace_book`
-- hepsi yerinde. Sorun eksik erişim yolu değil, GEREKSİZ İŞ HACMİ.
--
-- ÜÇÜNCÜ ÇARPAN — RLS: view'lar `security_invoker=on` (049). Yani
-- taranan HER satır için `book_tests` ve `test_completions`
-- politikaları değerlendiriliyor. Satır sayısını düşürmek, RLS
-- değerlendirme sayısını da düşürüyor. Kazanç iki yönlü.
--
-- ============================================================
-- ÇÖZÜM: ÖNCE TOPLA, SONRA BİRLEŞTİR
--
-- İki gözlem tasarımı belirliyor:
--
--   1. `total_tests` ATAMAYA DEĞİL KİTABA bağlı. Aynı kitabı 10 öğrenci
--      kullanıyorsa eski tanım aynı sayımı 10 kez yapıyordu. Kitap
--      başına bir kez toplanır.
--   2. `completed_tests` atamaya bağlı ve `test_completions` küçük
--      (1.154 satır). Atama başına bir kez toplanır.
--
-- Böylece fan-out ve DISTINCT tamamen ortadan kalkıyor: iki küçük
-- toplama, ardından anahtar üzerinden birleştirme.
--
-- ============================================================
-- DAVRANIŞ BİREBİR KORUNUYOR — ÜÇ İNCE NOKTA
--
-- 1. `JOIN book_tests` (INNER) idi: kitabında HİÇ test satırı olmayan
--    bir atama eski view'da GÖRÜNMÜYORDU. Yeni tanımda `kitap_test`
--    CTE'sine INNER JOIN yapılıyor; CTE de en az bir satırı olan
--    kitapları üretiyor. Aynı davranış.
--
--    LEFT JOIN yapmak "daha doğru" görünürdü ama bu bir DAVRANIŞ
--    DEĞİŞİKLİĞİ olurdu: panelde bugün görünmeyen atamalar %0 ilerleme
--    ile belirmeye başlardı. Maliyet düşürme turunda ürün davranışı
--    değiştirilmez.
--
-- 2. Eski tanımda tamamlama sayımı `tc.book_test_id = bt.id` üzerinden
--    gidiyordu, yani tamamlamanın testi ATAMANIN KİTABINA ait olmak
--    zorundaydı. `atama_tamam` CTE'si bu yüzden `book_id` ile de
--    gruplanıyor ve birleştirme `sba.book_id` üzerinden yapılıyor.
--    Başka kitabın testine yazılmış bir tamamlama yine sayılmaz.
--
-- 3. Eski tanımda tamamlama sayısı `count(DISTINCT tc.id)` idi;
--    `tc.id` birincil anahtar ve her tamamlama tek bir teste
--    bağlandığı için `count(*)` ile birebir aynı. DISTINCT yalnız
--    fan-out yüzünden gerekiyordu, o da kalktı.
--
-- `security_invoker=on` KORUNUYOR: kaldırılsa view sahibinin
-- haklarıyla çalışır ve 049'un kapattığı P0 açığı geri gelir —
-- tüm çalışma alanlarının verisi herkese açılır.
--
-- ============================================================
-- MIGRATION KENDİNİ DENETLİYOR
--
-- Yeni tanım geçici bir view olarak kuruluyor ve eskisiyle İKİ YÖNLÜ
-- EXCEPT ile karşılaştırılıyor. Tek satır fark varsa migration
-- EXCEPTION atıp durur; hiçbir şey değişmez.
--
-- Karşılaştırma `postgres` rolüyle koşuyor (rolbypassrls=true), yani
-- TÜM kiracıların satırları üzerinde yapılıyor — tek bir çalışma
-- alanında doğru görünüp başkasında bozulan bir değişiklik buradan
-- geçemez.
--
-- Yeniden çalıştırılabilir.
-- ============================================================

-- ------------------------------------------------------------
-- ADIM 1 — Yeni tanımı geçici view olarak kur
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.student_book_progress_view_112_kontrol;

CREATE VIEW public.student_book_progress_view_112_kontrol
WITH (security_invoker = on) AS
WITH kitap_test AS (
  -- Kitap başına bir kez. `WHERE ... IN (...)` kapsamı atanmış
  -- kitaplara indiriyor: 37.302 satırın tamamını taramak yerine yalnız
  -- fiilen kullanılan kitapların testleri okunuyor.
  SELECT
    bt.book_id,
    count(*) FILTER (WHERE bt.status = 'active') AS aktif_test
  FROM public.book_tests bt
  WHERE bt.book_id IN (
    SELECT sba.book_id
    FROM public.student_book_assignments sba
    WHERE sba.status = 'active'
  )
  GROUP BY bt.book_id
),
atama_tamam AS (
  -- Atama × kitap başına bir kez. `book_id` gruplamada: eski tanımın
  -- "tamamlamanın testi atamanın kitabına ait olmalı" kuralı korunuyor.
  SELECT
    tc.student_book_assignment_id AS sba_id,
    bt.book_id,
    count(*) AS tamamlanan
  FROM public.test_completions tc
  JOIN public.book_tests bt ON bt.id = tc.book_test_id
  WHERE tc.status = 'active'
  GROUP BY tc.student_book_assignment_id, bt.book_id
)
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
  COALESCE(at.tamamlanan, 0::BIGINT)       AS completed_tests,
  kt.aktif_test - COALESCE(at.tamamlanan, 0::BIGINT) AS remaining_tests,
  CASE
    WHEN kt.aktif_test = 0 THEN 0::NUMERIC
    ELSE round(COALESCE(at.tamamlanan, 0::BIGINT)::NUMERIC / kt.aktif_test::NUMERIC * 100::NUMERIC)
  END                                      AS completion_percentage,
  b.tracking_mode
FROM public.student_book_assignments sba
JOIN public.books b       ON b.id = sba.book_id
JOIN kitap_test kt        ON kt.book_id = sba.book_id
LEFT JOIN atama_tamam at  ON at.sba_id = sba.id AND at.book_id = sba.book_id
WHERE sba.status = 'active';

-- ------------------------------------------------------------
-- ADIM 2 — EŞDEĞERLİK DENETİMİ
--
-- İki yönlü EXCEPT: eskide olup yenide olmayan VE yenide olup eskide
-- olmayan satırlar. Tek yön yeterli değil — yeni tanım fazladan satır
-- üretiyorsa (örneğin INNER yerine LEFT JOIN kazası) tek yönlü
-- karşılaştırma bunu görmez.
-- ------------------------------------------------------------
DO $dogrula$
DECLARE
  v_eski_fazla BIGINT;
  v_yeni_fazla BIGINT;
  v_eski_toplam BIGINT;
BEGIN
  SELECT count(*) INTO v_eski_toplam FROM public.student_book_progress_view;

  SELECT count(*) INTO v_eski_fazla FROM (
    SELECT * FROM public.student_book_progress_view
    EXCEPT ALL
    SELECT * FROM public.student_book_progress_view_112_kontrol
  ) s;

  SELECT count(*) INTO v_yeni_fazla FROM (
    SELECT * FROM public.student_book_progress_view_112_kontrol
    EXCEPT ALL
    SELECT * FROM public.student_book_progress_view
  ) s;

  IF v_eski_fazla <> 0 OR v_yeni_fazla <> 0 THEN
    RAISE EXCEPTION
      '112 DOĞRULAMA: view''lar aynı sonucu vermiyor (eskide fazla: %, yenide fazla: %). Geçiş YAPILMADI.',
      v_eski_fazla, v_yeni_fazla;
  END IF;

  -- Boş sonuç üzerinde "fark yok" demek hiçbir şey kanıtlamaz: iki boş
  -- küme de eşittir. Karşılaştırmanın gerçekten veri üzerinde
  -- yapıldığı ayrıca iddia ediliyor.
  IF v_eski_toplam = 0 THEN
    RAISE EXCEPTION
      '112 DOĞRULAMA: eski view hiç satır döndürmedi, karşılaştırma anlamsız. Geçiş YAPILMADI.';
  END IF;

  RAISE NOTICE '112: % satırda birebir eşdeğerlik doğrulandı.', v_eski_toplam;
END;
$dogrula$;

-- ------------------------------------------------------------
-- ADIM 3 — GEÇİŞ
--
-- CREATE OR REPLACE kullanılıyor: kolon adları, sırası ve tipleri
-- birebir aynı olduğu için `teacher_student_overview_view` ve diğer
-- bağımlılıklar bozulmadan yerinde değişir. DROP + CREATE yapılsaydı
-- bağımlı view'ların hepsini yeniden kurmak gerekirdi.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.student_book_progress_view
WITH (security_invoker = on) AS
WITH kitap_test AS (
  SELECT
    bt.book_id,
    count(*) FILTER (WHERE bt.status = 'active') AS aktif_test
  FROM public.book_tests bt
  WHERE bt.book_id IN (
    SELECT sba.book_id
    FROM public.student_book_assignments sba
    WHERE sba.status = 'active'
  )
  GROUP BY bt.book_id
),
atama_tamam AS (
  SELECT
    tc.student_book_assignment_id AS sba_id,
    bt.book_id,
    count(*) AS tamamlanan
  FROM public.test_completions tc
  JOIN public.book_tests bt ON bt.id = tc.book_test_id
  WHERE tc.status = 'active'
  GROUP BY tc.student_book_assignment_id, bt.book_id
)
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
  COALESCE(at.tamamlanan, 0::BIGINT)       AS completed_tests,
  kt.aktif_test - COALESCE(at.tamamlanan, 0::BIGINT) AS remaining_tests,
  CASE
    WHEN kt.aktif_test = 0 THEN 0::NUMERIC
    ELSE round(COALESCE(at.tamamlanan, 0::BIGINT)::NUMERIC / kt.aktif_test::NUMERIC * 100::NUMERIC)
  END                                      AS completion_percentage,
  b.tracking_mode
FROM public.student_book_assignments sba
JOIN public.books b       ON b.id = sba.book_id
JOIN kitap_test kt        ON kt.book_id = sba.book_id
LEFT JOIN atama_tamam at  ON at.sba_id = sba.id AND at.book_id = sba.book_id
WHERE sba.status = 'active';

-- ------------------------------------------------------------
-- ADIM 4 — Geçici view'ı kaldır
--
-- Kalırsa `tenant-isolation.test.ts`'in "kilitli view" listesinde
-- olmayan, anon'a açık olup olmadığı denetlenmemiş bir nesne bırakırdı.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.student_book_progress_view_112_kontrol;

-- ------------------------------------------------------------
-- ADIM 5 — Geçişin gerçekten olduğunu doğrula
-- ------------------------------------------------------------
DO $son$
BEGIN
  IF (SELECT pg_get_viewdef('public.student_book_progress_view'::regclass, true)) NOT LIKE '%kitap_test%' THEN
    RAISE EXCEPTION '112 DOĞRULAMA: view eski tanımda kaldı.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'student_book_progress_view'
      AND c.reloptions @> ARRAY['security_invoker=on']
  ) THEN
    RAISE EXCEPTION '112 DOĞRULAMA: security_invoker kayboldu — 049''un kapattığı açık geri döner.';
  END IF;

  RAISE NOTICE '112: geçiş tamam, security_invoker yerinde.';
END;
$son$;

-- ============================================================
-- ROLLBACK — eski tanım
--
-- CREATE OR REPLACE VIEW public.student_book_progress_view
-- WITH (security_invoker = on) AS
-- SELECT
--   sba.workspace_id, sba.academic_term_id, sba.student_id,
--   sba.id AS student_book_assignment_id, sba.book_id,
--   b.title AS book_title, b.subject, b.exam_type, b.publisher,
--   sba.start_date, sba.target_end_date, sba.status AS assignment_status,
--   count(DISTINCT bt.id) FILTER (WHERE bt.status = 'active') AS total_tests,
--   count(DISTINCT tc.id) FILTER (WHERE tc.status = 'active') AS completed_tests,
--   count(DISTINCT bt.id) FILTER (WHERE bt.status = 'active')
--     - count(DISTINCT tc.id) FILTER (WHERE tc.status = 'active') AS remaining_tests,
--   CASE
--     WHEN count(DISTINCT bt.id) FILTER (WHERE bt.status = 'active') = 0 THEN 0::NUMERIC
--     ELSE round(count(DISTINCT tc.id) FILTER (WHERE tc.status = 'active')::NUMERIC
--          / count(DISTINCT bt.id) FILTER (WHERE bt.status = 'active')::NUMERIC * 100::NUMERIC)
--   END AS completion_percentage,
--   b.tracking_mode
-- FROM public.student_book_assignments sba
-- JOIN public.books b ON b.id = sba.book_id
-- JOIN public.book_tests bt ON bt.book_id = sba.book_id
-- LEFT JOIN public.test_completions tc
--   ON tc.student_book_assignment_id = sba.id
--  AND tc.book_test_id = bt.id
--  AND tc.status = 'active'
-- WHERE sba.status = 'active'
-- GROUP BY sba.workspace_id, sba.academic_term_id, sba.student_id, sba.id,
--          sba.book_id, b.title, b.subject, b.exam_type, b.publisher,
--          b.tracking_mode, sba.start_date, sba.target_end_date, sba.status;
--
-- Geri alınırsa panel maliyeti eski hâline döner ve 40 eşzamanlıda
-- 25P02 zinciri yeniden mümkün olur.
-- ============================================================
