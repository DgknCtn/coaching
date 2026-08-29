-- ============================================================
-- 027_overdue_local_day  (R6-02)
--
-- SORUN
-- Gecikme kararı iki ayrı takvim gününe göre veriliyordu:
--   - SQL tarafı  : CURRENT_DATE  -> veritabanının timezone'u (Supabase'de UTC)
--   - TS tarafı   : yerel takvim günü (lib/homework-status.ts:toDateString)
--
-- Türkiye UTC+3 olduğu için gece 00:00-03:00 arasında UTC hâlâ "dün"dedir.
-- Aynı ödev o saatlerde Görevler sayacında gecikmiş görünmezken öğrenci
-- kartında gecikmiş görünebiliyordu. R6-02 kabul testi #12 ("öğretmen,
-- öğrenci ve veli ekranlarında aynı ödev için çelişkili gecikme sonucu
-- oluşmamalı") tam olarak bunu yasaklıyor.
--
-- ÇÖZÜM
-- Takvim gününü üreten TEK bir fonksiyon: public.today_local(). Uygulamanın
-- iş günü Türkiye'ye göre tanımlıdır; DB timezone'u ne olursa olsun view'lar
-- bu fonksiyondan beslenir ve TS tarafıyla aynı günü görür.
--
-- GERİ ALMA
-- today_local() DROP edilir ve iki view aşağıdaki "-- ROLLBACK" bloğundaki
-- CURRENT_DATE'li hâlleriyle CREATE OR REPLACE edilir. Veri değişmez:
-- bu migration yalnız okuma tarafını (view) etkiler, hiçbir satırı yazmaz.
-- ============================================================

-- ============================================================
-- 1) Takvim günü — tek kaynak
--
-- STABLE (IMMUTABLE değil): sonuç zamana bağlıdır, aynı transaction içinde
-- sabittir. Planner'ın view içinde tek kez değerlendirmesi için yeterli.
-- ============================================================
CREATE OR REPLACE FUNCTION public.today_local()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
  SELECT (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE;
$fn$;

COMMENT ON FUNCTION public.today_local() IS
  'R6-02: uygulamanın iş takvim günü (Europe/Istanbul). Gecikme hesabı '
  'yapan view''lar CURRENT_DATE yerine bunu kullanır ki TS tarafındaki '
  'lib/homework-status.ts ile aynı günü görsünler.';

-- ============================================================
-- 2) student_weekly_homework_summary_view
--
-- 014'teki tanımın birebir aynısı; TEK fark CURRENT_DATE -> today_local().
-- Kolon adları ve SIRASI korunur (Postgres 42P16).
-- ============================================================
CREATE OR REPLACE VIEW public.student_weekly_homework_summary_view AS
SELECT
  hb.workspace_id,
  hb.academic_term_id,
  hb.student_id,
  DATE_TRUNC('week', public.today_local())::DATE              AS week_start,
  (DATE_TRUNC('week', public.today_local()) + INTERVAL '6 days')::DATE AS week_end,
  COUNT(hi.id) FILTER (WHERE hi.status != 'cancelled')
                                                      AS assigned_tests,
  COUNT(hi.id) FILTER (WHERE hi.status = 'completed')
                                                      AS completed_tests,
  COUNT(hi.id) FILTER (WHERE hi.status = 'pending')
                                                      AS pending_tests,
  COUNT(hi.id) FILTER (
    WHERE hi.status = 'pending'
      AND hb.due_date < public.today_local()
  )                                                   AS overdue_tests,
  COUNT(hi.id) FILTER (WHERE hi.status = 'pending_approval')
                                                      AS pending_approval_tests
FROM public.homework_batches hb
JOIN public.homework_items hi ON hi.homework_batch_id = hb.id
WHERE hb.status = 'active'
  AND hb.due_date BETWEEN DATE_TRUNC('week', public.today_local())::DATE
                      AND (DATE_TRUNC('week', public.today_local()) + INTERVAL '6 days')::DATE
GROUP BY hb.workspace_id, hb.academic_term_id, hb.student_id;

-- ============================================================
-- 3) student_overdue_homework_view
--
-- 016'daki tanımın birebir aynısı; TEK fark CURRENT_DATE -> today_local().
-- 'pending_approval' hariç tutma kuralı bilinçli olarak korunur: öğrenci işi
-- zamanında bitirip onaya gönderdiyse bu "geciken" değil "onay bekleyen"dir.
-- ============================================================
CREATE OR REPLACE VIEW public.student_overdue_homework_view AS
SELECT
  hb.workspace_id,
  hb.student_id,
  COUNT(hi.id)                                     AS overdue_items,
  MIN(hb.due_date)                                 AS oldest_due_date
FROM public.homework_batches hb
JOIN public.homework_items hi ON hi.homework_batch_id = hb.id
WHERE hb.status = 'active'
  AND hi.status = 'pending'
  AND hb.due_date < public.today_local()
GROUP BY hb.workspace_id, hb.student_id;

-- ============================================================
-- ROLLBACK (geri alma)
--
-- Aşağıdaki blok yorumdan çıkarılıp çalıştırıldığında sistem 027 öncesi
-- davranışa döner. Önce view'lar CURRENT_DATE'e döndürülmeli, SONRA
-- fonksiyon düşürülmeli (view'lar ona bağımlı).
--
--   CREATE OR REPLACE VIEW public.student_overdue_homework_view AS
--   SELECT hb.workspace_id, hb.student_id,
--          COUNT(hi.id) AS overdue_items, MIN(hb.due_date) AS oldest_due_date
--   FROM public.homework_batches hb
--   JOIN public.homework_items hi ON hi.homework_batch_id = hb.id
--   WHERE hb.status = 'active' AND hi.status = 'pending'
--     AND hb.due_date < CURRENT_DATE
--   GROUP BY hb.workspace_id, hb.student_id;
--
--   -- student_weekly_homework_summary_view için 014_homework_approval_flow.sql
--   -- içindeki tanımı aynen yeniden çalıştırın.
--
--   DROP FUNCTION IF EXISTS public.today_local();
-- ============================================================
