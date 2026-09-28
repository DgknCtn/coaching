-- ============================================================
-- 130 — KONU TEMAS GÖRÜNÜMÜ: FİLTRE İÇERİ İNSİN (B13)
--
-- ÖLÇÜM (28 Eylül 2026, sayfa senaryosu, hafif yük): öğrenci detayındaki
-- `student_topic_contact_view` sorgusu p50 1.182 ms, p95 2.015 ms —
-- uygulamanın en yavaş sorgusu (diğerleri 70-380 ms).
--
-- NEDEN (041'deki tanım):
--   1. `all_contacts` CTE'si İKİ KEZ kullanılıyordu (sıralama + son satırdaki
--      alt sorgu). PostgreSQL 12+ iki kez başvurulan CTE'yi MATERYALİZE
--      eder: sayfa tek bir öğrenci istese de görünen TÜM öğrencilerin TÜM
--      onaylı testleri book_tests ve book_sections ile birleştiriliyor,
--      filtre ancak en sonda uygulanıyordu.
--   2. `last_contact_amount` her sonuç satırı için o materyalize kümeyi
--      yeniden tarayan bağıntılı bir alt sorguydu.
--
-- DÜZELTME: "son temas günündeki miktar" aynı geçişte pencere
-- fonksiyonuyla (PARTITION BY ..., activity_date) hesaplanıyor; CTE tek
-- kez kullanılıyor ve satır içine alınabiliyor. Tüm pencereler
-- (workspace_id, student_id, ...) ile bölümlendiği için uygulamanın
-- `student_id=eq` ve `workspace_id=eq` filtreleri pencerenin ALTINA,
-- UNION'ın iki koluna ve idx_tc_workspace_student indeksine iner.
--
-- ÇIKTI AYNI: sütun adları, sırası ve türleri korunuyor (CREATE OR REPLACE
-- bunu zaten şart koşar). workspace_id'nin bölüme eklenmesi sonucu
-- değiştirmez — öğrenci tek çalışma alanına ait. Aşağıdaki doğrulama
-- bloğu eski ve yeni tanımı TÜM veride karşılaştırır; tek satır farkında
-- migration geri alınır. (last_contact_source karşılaştırılmaz: aynı gün
-- birden çok kaynak varsa ikisinde de ROW_NUMBER keyfi seçer.)
-- ============================================================

CREATE OR REPLACE VIEW public.student_topic_contact_view
WITH (security_invoker = on) AS
WITH all_contacts AS (
  -- Onaylı test/sayfa çalışması. Kopyalanmaz, buradan TÜRETİLİR.
  SELECT
    tc.workspace_id,
    tc.student_id,
    bs.topic_id,
    COALESCE(tc.studied_on, tc.completed_at::DATE) AS activity_date,
    'homework'::TEXT                               AS source_kind
  FROM public.test_completions tc
  JOIN public.book_tests    bt ON bt.id = tc.book_test_id
  JOIN public.book_sections bs ON bs.id = bt.section_id
  WHERE tc.status = 'active'
    AND bs.topic_id IS NOT NULL
  UNION ALL
  -- Ders ve serbest çalışma: sistemde başka karşılığı olmayan temaslar.
  SELECT
    c.workspace_id,
    c.student_id,
    c.topic_id,
    c.activity_date,
    c.kind AS source_kind
  FROM public.topic_contacts c
),
ranked AS (
  SELECT
    a.*,
    ROW_NUMBER() OVER (
      PARTITION BY a.workspace_id, a.student_id, a.topic_id
      ORDER BY a.activity_date DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY a.workspace_id, a.student_id, a.topic_id) AS total_contacts,
    -- Son temas gününde kaç çalışma: "Son temas 18 gün önce • 2 test".
    COUNT(*) OVER (PARTITION BY a.workspace_id, a.student_id, a.topic_id, a.activity_date) AS day_contacts
  FROM all_contacts a
)
SELECT
  r.workspace_id,
  r.student_id,
  r.topic_id,
  r.activity_date  AS last_contact_date,
  r.source_kind    AS last_contact_source,
  r.total_contacts,
  r.day_contacts   AS last_contact_amount
FROM ranked r
WHERE r.rn = 1;

-- CREATE OR REPLACE seçenekleri koruyor mu diye düşünmeye gerek kalmasın:
ALTER VIEW public.student_topic_contact_view SET (security_invoker = on);


DO $dogrula$
DECLARE
  v_fark INTEGER;
BEGIN
  -- 1) Güvenlik: invoker kalmalı (049). Kaybolursa görünüm sahibinin
  --    yetkisiyle çalışır ve RLS'i atlar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.student_topic_contact_view'::regclass
      AND reloptions @> ARRAY['security_invoker=on']
  ) THEN
    RAISE EXCEPTION '130 DOĞRULAMA: student_topic_contact_view security_invoker değil.';
  END IF;

  -- 2) Eşitlik: 041'in tanımı (satır içi) ile yeni görünüm, tüm veride.
  WITH eski AS (
    WITH derived AS (
      SELECT tc.workspace_id, tc.student_id, bs.topic_id,
             COALESCE(tc.studied_on, tc.completed_at::DATE) AS activity_date,
             'homework'::TEXT AS source_kind
      FROM public.test_completions tc
      JOIN public.book_tests bt ON bt.id = tc.book_test_id
      JOIN public.book_sections bs ON bs.id = bt.section_id
      WHERE tc.status = 'active' AND bs.topic_id IS NOT NULL
    ),
    manual AS (
      SELECT c.workspace_id, c.student_id, c.topic_id, c.activity_date, c.kind AS source_kind
      FROM public.topic_contacts c
    ),
    all_contacts AS (SELECT * FROM derived UNION ALL SELECT * FROM manual),
    ranked AS (
      SELECT a.*,
             ROW_NUMBER() OVER (PARTITION BY a.student_id, a.topic_id ORDER BY a.activity_date DESC) AS rn,
             COUNT(*) OVER (PARTITION BY a.student_id, a.topic_id) AS total_contacts
      FROM all_contacts a
    )
    SELECT r.workspace_id, r.student_id, r.topic_id, r.activity_date AS last_contact_date,
           r.total_contacts,
           (SELECT COUNT(*) FROM all_contacts x
             WHERE x.student_id = r.student_id AND x.topic_id = r.topic_id
               AND x.activity_date = r.activity_date) AS last_contact_amount
    FROM ranked r WHERE r.rn = 1
  ),
  yeni AS (
    SELECT workspace_id, student_id, topic_id, last_contact_date, total_contacts, last_contact_amount
    FROM public.student_topic_contact_view
  )
  SELECT COUNT(*) INTO v_fark FROM (
    (SELECT * FROM eski EXCEPT ALL SELECT * FROM yeni)
    UNION ALL
    (SELECT * FROM yeni EXCEPT ALL SELECT * FROM eski)
  ) d;

  IF v_fark > 0 THEN
    RAISE EXCEPTION '130 DOĞRULAMA: yeni görünüm eskisinden % satırda farklı — geri alındı.', v_fark;
  END IF;

  RAISE NOTICE '130: konu temas görünümü eskisiyle birebir aynı; filtre artık içeri iniyor.';
END;
$dogrula$;

-- ROLLBACK: 041'deki CREATE OR REPLACE VIEW public.student_topic_contact_view
-- tanımı + ALTER VIEW ... SET (security_invoker = on).
