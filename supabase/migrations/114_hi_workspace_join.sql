-- ============================================================
-- 114 — KURUM FİLTRESİ ÖDEV KALEMİNE DE İNSİN
--
-- ============================================================
-- ÖLÇÜM (27 Eylül 2026, 40 eşzamanlı yük testinden sonra)
--
-- 112 + 113 sonrası 40 eşzamanlı kullanıcıda 5xx = 0, ama panel p50
-- 2.163 ms, p99 11.952 ms. Tek kullanıcıda B kiracısının panel sorgusu
-- (`teacher_student_operation_view`, uygulamanın attığı gibi
-- workspace_id filtreli) SQL Editor'de, B öğretmeninin kimliğiyle ve
-- RLS DAHİL açıklandı:
--
--   Execution 117 ms · Planning 31 ms
--
--   student_overdue_homework_view  alt sorgusu  ->  SubPlan 58: 24,4 ms
--   student_pending_approval_view  alt sorgusu  ->  SubPlan 52: 23,8 ms
--
-- İkisi de aynı şeyi yapıyor ve ikisinin nedeni de aynı:
--
--   Index Scan ... on homework_items hi
--     Index Cond: (status = 'pending')          <-- YALNIZ durum
--     Filter: workspace_id IN (benim alanlarım)
--             OR homework_batch_id IN (öğrenci/veli olduğum paketler)
--     Rows Removed by Filter: 4                 <-- BAŞKA KİRACININ satırları
--
-- Kurum filtresi `hb.workspace_id` üzerinde; `hi`'ye İNMİYOR. Tarama
-- tüm kiracıların bekleyen kalemlerini okuyor. Yabancı satır, politikanın
-- ilk dalını geçemediği için ikinci dala düşüyor ve o dal (hashed SubPlan)
-- HER görünen ödev paketi için `is_student_self` + `is_parent_of_student`
-- çağırarak kuruluyor — 53 paket, ~24 ms. Tek bir yabancı satır bu
-- maliyeti tetiklemeye yetiyor.
--
-- Yani maliyet kiracının verisiyle değil, VERİTABANINDA BAŞKA KİRACI
-- OLMASIYLA büyüyor. Müşteri sayısı arttıkça her panel yavaşlar.
--
-- ============================================================
-- DÜZELTME
--
-- Birleşime `hi.workspace_id = hb.workspace_id` eklendi. Planlayıcı
-- eşitliği taşır (equivalence class): dışarıdan gelen
-- `workspace_id = X` artık `hi.workspace_id = X` olarak da uygulanır ve
-- `idx_hi_workspace_status` iki sütunuyla kullanılır. Yabancı satır hiç
-- okunmaz; ikinci politika dalı hiç kurulmaz.
--
-- ANLAM KORUNUYOR MU: yalnız her kalemin kurumu paketinin kurumuyla
-- aynıysa. Bu bir veri iddiası, varsayım değil — ADIM 1 bunu canlı
-- veride doğruluyor ve tek istisna varsa migration duruyor. ADIM 2 de
-- yeni tanımı eskisiyle iki yönlü EXCEPT ALL ile karşılaştırıyor (112 /
-- 113 deseni). Karşılaştırma `postgres` rolüyle koştuğu için (RLS'i
-- atlar) tüm kiracıların satırları üzerinde yapılıyor.
--
-- security_invoker=on açıkça yeniden veriliyor (049'un kapattığı açık).
-- ============================================================


-- ------------------------------------------------------------
-- ADIM 1 — Veri koşulu: kalem ile paketi aynı kurumda mı?
-- ------------------------------------------------------------
DO $kosul$
DECLARE
  v_uyumsuz BIGINT;
BEGIN
  SELECT count(*) INTO v_uyumsuz
  FROM public.homework_items hi
  JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
  WHERE hi.workspace_id IS DISTINCT FROM hb.workspace_id;

  IF v_uyumsuz <> 0 THEN
    RAISE EXCEPTION
      '114 DOĞRULAMA: % ödev kaleminin kurumu paketinin kurumundan farklı. Ek koşul anlamı değiştirirdi. Geçiş YAPILMADI.',
      v_uyumsuz;
  END IF;

  RAISE NOTICE '114: tüm ödev kalemleri paketleriyle aynı kurumda.';
END;
$kosul$;


-- ------------------------------------------------------------
-- ADIM 2 — Aday tanımlar ve birebir eşdeğerlik
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.student_overdue_homework_view_114_kontrol AS
SELECT
  hb.workspace_id,
  hb.student_id,
  COUNT(hi.id)                                     AS overdue_items,
  MIN(hb.due_date)                                 AS oldest_due_date
FROM public.homework_batches hb
JOIN public.homework_items hi
  ON hi.homework_batch_id = hb.id
 AND hi.workspace_id = hb.workspace_id
WHERE hb.status = 'active'
  AND hi.status = 'pending'
  AND hb.due_date < public.today_local()
GROUP BY hb.workspace_id, hb.student_id;

CREATE OR REPLACE VIEW public.student_pending_approval_view_114_kontrol AS
SELECT
  hb.workspace_id,
  hb.student_id,
  COUNT(hi.id)                                     AS pending_approval_items,
  MIN(hi.submitted_at)                             AS oldest_submitted_at
FROM public.homework_batches hb
JOIN public.homework_items hi
  ON hi.homework_batch_id = hb.id
 AND hi.workspace_id = hb.workspace_id
WHERE hb.status = 'active'
  AND hi.status = 'pending_approval'
GROUP BY hb.workspace_id, hb.student_id;

DO $dogrula$
DECLARE
  v_fark  BIGINT;
  v_top1  BIGINT;
  v_top2  BIGINT;
BEGIN
  SELECT count(*) INTO v_fark FROM (
    (SELECT * FROM public.student_overdue_homework_view
     EXCEPT ALL SELECT * FROM public.student_overdue_homework_view_114_kontrol)
    UNION ALL
    (SELECT * FROM public.student_overdue_homework_view_114_kontrol
     EXCEPT ALL SELECT * FROM public.student_overdue_homework_view)
  ) s;
  IF v_fark <> 0 THEN
    RAISE EXCEPTION '114 DOĞRULAMA: geciken ödev view''ında % satır fark. Geçiş YAPILMADI.', v_fark;
  END IF;

  SELECT count(*) INTO v_fark FROM (
    (SELECT * FROM public.student_pending_approval_view
     EXCEPT ALL SELECT * FROM public.student_pending_approval_view_114_kontrol)
    UNION ALL
    (SELECT * FROM public.student_pending_approval_view_114_kontrol
     EXCEPT ALL SELECT * FROM public.student_pending_approval_view)
  ) s;
  IF v_fark <> 0 THEN
    RAISE EXCEPTION '114 DOĞRULAMA: onay bekleyen view''ında % satır fark. Geçiş YAPILMADI.', v_fark;
  END IF;

  SELECT count(*) INTO v_top1 FROM public.student_overdue_homework_view;
  SELECT count(*) INTO v_top2 FROM public.student_pending_approval_view;
  IF v_top1 = 0 AND v_top2 = 0 THEN
    RAISE EXCEPTION '114 DOĞRULAMA: iki view da boş, karşılaştırma anlamsız. Geçiş YAPILMADI.';
  END IF;

  RAISE NOTICE '114: birebir eşdeğer (geciken % satır, onay bekleyen % satır).', v_top1, v_top2;
END;
$dogrula$;


-- ------------------------------------------------------------
-- ADIM 3 — Geçiş
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.student_overdue_homework_view
WITH (security_invoker = on) AS
SELECT
  hb.workspace_id,
  hb.student_id,
  COUNT(hi.id)                                     AS overdue_items,
  MIN(hb.due_date)                                 AS oldest_due_date
FROM public.homework_batches hb
JOIN public.homework_items hi
  ON hi.homework_batch_id = hb.id
 AND hi.workspace_id = hb.workspace_id
WHERE hb.status = 'active'
  AND hi.status = 'pending'
  AND hb.due_date < public.today_local()
GROUP BY hb.workspace_id, hb.student_id;

CREATE OR REPLACE VIEW public.student_pending_approval_view
WITH (security_invoker = on) AS
SELECT
  hb.workspace_id,
  hb.student_id,
  COUNT(hi.id)                                     AS pending_approval_items,
  MIN(hi.submitted_at)                             AS oldest_submitted_at
FROM public.homework_batches hb
JOIN public.homework_items hi
  ON hi.homework_batch_id = hb.id
 AND hi.workspace_id = hb.workspace_id
WHERE hb.status = 'active'
  AND hi.status = 'pending_approval'
GROUP BY hb.workspace_id, hb.student_id;

DROP VIEW IF EXISTS public.student_overdue_homework_view_114_kontrol;
DROP VIEW IF EXISTS public.student_pending_approval_view_114_kontrol;


-- ------------------------------------------------------------
-- ADIM 4 — Geçişin doğrulanması
-- ------------------------------------------------------------
DO $son$
DECLARE
  v_view TEXT;
BEGIN
  FOREACH v_view IN ARRAY ARRAY['student_overdue_homework_view', 'student_pending_approval_view'] LOOP
    IF pg_get_viewdef(('public.' || v_view)::regclass, true) NOT LIKE '%hi.workspace_id = hb.workspace_id%' THEN
      RAISE EXCEPTION '114 DOĞRULAMA: % eski tanımda kaldı.', v_view;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_view
        AND c.reloptions @> ARRAY['security_invoker=on']
    ) THEN
      RAISE EXCEPTION '114 DOĞRULAMA: % üzerinde security_invoker kayboldu — 049''un kapattığı açık geri döner.', v_view;
    END IF;

    IF has_table_privilege('anon', 'public.' || v_view, 'SELECT') THEN
      RAISE EXCEPTION '114 DOĞRULAMA: % anon''a açık.', v_view;
    END IF;
  END LOOP;

  RAISE NOTICE '114: geçiş tamam, security_invoker yerinde, anon kapalı.';
END;
$son$;

-- ============================================================
-- ROLLBACK
--
-- 027'deki student_overdue_homework_view ve 017'deki
-- student_pending_approval_view tanımları `WITH (security_invoker = on)`
-- ile yeniden çalıştırılır. Geri alınırsa panel yabancı kiracı
-- satırlarının politika maliyetini yeniden öder.
-- ============================================================
