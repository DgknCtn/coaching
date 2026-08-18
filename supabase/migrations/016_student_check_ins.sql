-- ============================================================
-- 016_student_check_ins
-- Revizyon 01: Öğretmen dashboard'u "istatistik ekranı"ndan
-- "günlük kontrol masası"na dönüşüyor. Bunun için iki eksik parça:
--
--   1) Durum bildirimi (check-in) altyapısı: öğrenci planlı aralıklarla
--      "nasıl gidiyor" bildirimi gönderir. Süresi geçen ve üzerinden
--      24 saat geçen bildirim öğretmenin dikkatine düşer.
--   2) Hafta penceresinden bağımsız "geciken çalışma" sayımı. Mevcut
--      student_weekly_homework_summary_view yalnızca içinde bulunulan
--      haftaya düşen due_date'leri sayıyordu; geçen haftadan kalan
--      geciken ödevler dashboard'da hiç görünmüyordu.
-- ============================================================

-- ============================================================
-- 1) student_check_in_schedules — öğrenci başına bildirim ritmi
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_check_in_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  interval_days   INT NOT NULL DEFAULT 3 CHECK (interval_days BETWEEN 1 AND 30),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2) student_check_ins — planlanan / gönderilen bildirimler
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_check_ins (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id              UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_term_id        UUID REFERENCES public.academic_terms(id),
  due_at                  TIMESTAMPTZ NOT NULL,
  submitted_at            TIMESTAMPTZ,
  submitted_by_profile_id UUID REFERENCES public.profiles(id),
  mood                    TEXT CHECK (mood IN ('iyi', 'idare_eder', 'zorlaniyorum')),
  message                 TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'submitted', 'skipped')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_check_ins_student_due
  ON public.student_check_ins (workspace_id, student_id, due_at DESC);

CREATE INDEX IF NOT EXISTS idx_check_ins_status
  ON public.student_check_ins (workspace_id, status);

-- Öğrenci başına aynı anda tek açık bildirim. ensure_student_check_ins'in
-- eşzamanlı çağrılarında satır çoğaltmasını engelleyen kilit nokta.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_check_in_per_student
  ON public.student_check_ins (student_id)
  WHERE status = 'pending';

-- ============================================================
-- 3) RLS
-- Yazma yalnızca SECURITY DEFINER RPC'ler üzerinden; tablolarda
-- doğrudan INSERT/UPDATE policy'si bilinçli olarak yok.
-- ============================================================
ALTER TABLE public.student_check_in_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_check_ins          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "check_in_schedules_select" ON public.student_check_in_schedules;
CREATE POLICY "check_in_schedules_select" ON public.student_check_in_schedules
  FOR SELECT USING (public.can_read_student(student_id, workspace_id));

DROP POLICY IF EXISTS "check_ins_select" ON public.student_check_ins;
CREATE POLICY "check_ins_select" ON public.student_check_ins
  FOR SELECT USING (public.can_read_student(student_id, workspace_id));

-- ============================================================
-- 4) upsert_check_in_schedule — öğretmen periyodu belirler
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_check_in_schedule(
  p_student_id     UUID,
  p_interval_days  INT DEFAULT 3,
  p_is_active      BOOLEAN DEFAULT TRUE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.student_check_in_schedules (
    workspace_id, student_id, interval_days, is_active
  ) VALUES (
    v_workspace_id, p_student_id, p_interval_days, p_is_active
  )
  ON CONFLICT (student_id) DO UPDATE
    SET interval_days = EXCLUDED.interval_days,
        is_active     = EXCLUDED.is_active,
        updated_at    = NOW();

  RETURN jsonb_build_object('student_id', p_student_id, 'saved', true);
END;
$$;

-- ============================================================
-- 5) ensure_student_check_ins — tembel materyalizasyon
-- Cron yok: dashboard / öğrenci paneli yüklenirken çağrılır ve
-- aktif planı olup açık bildirimi olmayan her öğrenci için bir
-- 'pending' satır açar. Idempotent — ikinci çağrı satır eklemez
-- (partial unique index + ON CONFLICT DO NOTHING).
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_student_check_ins(
  p_workspace_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_created INT := 0;
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH candidate AS (
    SELECT
      s.workspace_id,
      s.id AS student_id,
      sch.interval_days,
      COALESCE(
        (SELECT MAX(ci.submitted_at)
           FROM public.student_check_ins ci
          WHERE ci.student_id = s.id AND ci.status = 'submitted'),
        sch.created_at
      ) AS anchor_at
    FROM public.students s
    JOIN public.student_check_in_schedules sch ON sch.student_id = s.id
    WHERE s.workspace_id = p_workspace_id
      AND s.status = 'active'
      AND sch.is_active
      AND NOT EXISTS (
        SELECT 1 FROM public.student_check_ins ci
         WHERE ci.student_id = s.id AND ci.status = 'pending'
      )
  )
  INSERT INTO public.student_check_ins (workspace_id, student_id, due_at)
  SELECT workspace_id, student_id, anchor_at + (interval_days * INTERVAL '1 day')
  FROM candidate
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object('created', v_created);
END;
$$;

-- ============================================================
-- 6) submit_student_check_in — öğrenci (veya öğretmen adına) bildirir
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_student_check_in(
  p_check_in_id UUID,
  p_mood        TEXT DEFAULT NULL,
  p_message     TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id UUID;
  v_row        public.student_check_ins%ROWTYPE;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_row FROM public.student_check_ins WHERE id = p_check_in_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Durum bildirimi bulunamadı'; END IF;

  IF NOT (
    public.has_workspace_role(v_row.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_row.student_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_row.status != 'pending' THEN
    RETURN jsonb_build_object('check_in_id', p_check_in_id, 'already_submitted', true);
  END IF;

  UPDATE public.student_check_ins
  SET status = 'submitted', submitted_at = NOW(),
      submitted_by_profile_id = v_profile_id,
      mood = p_mood, message = p_message
  WHERE id = p_check_in_id;

  RETURN jsonb_build_object('check_in_id', p_check_in_id, 'submitted', true);
END;
$$;

-- ============================================================
-- 7) student_overdue_homework_view
-- Hafta penceresi YOK: son teslim tarihi geçmiş, öğrenci tarafından
-- tamamlandı olarak işaretlenmemiş, iptal edilmemiş tüm görevler.
-- 'pending_approval' bilinçli olarak hariç: öğrenci işi zamanında
-- bitirdiyse ama öğretmen henüz onaylamadıysa bu "geciken" değil,
-- "onay bekleyen"dir (Revizyon 01 §3).
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
  AND hb.due_date < CURRENT_DATE
GROUP BY hb.workspace_id, hb.student_id;

-- ============================================================
-- 8) student_check_in_status_view
-- Son temas + 24 saat kuralı tek yerde tanımlı.
-- ============================================================
CREATE OR REPLACE VIEW public.student_check_in_status_view AS
SELECT
  ci.workspace_id,
  ci.student_id,
  MAX(ci.submitted_at) FILTER (WHERE ci.status = 'submitted')
                                                   AS last_check_in_at,
  MIN(ci.due_at) FILTER (
    WHERE ci.status = 'pending'
      AND ci.due_at < NOW() - INTERVAL '24 hours'
  )                                                AS pending_check_in_since
FROM public.student_check_ins ci
GROUP BY ci.workspace_id, ci.student_id;

-- ============================================================
-- 9) teacher_student_overview_view
-- NOT: CREATE OR REPLACE VIEW mevcut kolonların sırasını/adını
-- değiştiremez (Postgres 42P16) — 013/014'te de aynı kısıt var.
-- Bu yüzden 014'teki kolon sırası harfi harfine korundu ve yeni
-- kolonlar YALNIZCA sona eklendi.
--
-- risk_status kolonu view'da kalıyor (teacher/students listesi hâlâ
-- kullanıyor); dashboard artık göstermiyor.
-- ============================================================
CREATE OR REPLACE VIEW public.teacher_student_overview_view AS
WITH weekly AS (
  SELECT * FROM public.student_weekly_homework_summary_view
),
progress AS (
  SELECT
    student_id,
    workspace_id,
    SUM(total_tests)       AS total_tests,
    SUM(completed_tests)   AS completed_tests,
    SUM(remaining_tests)   AS remaining_tests,
    CASE
      WHEN SUM(total_tests) = 0 THEN 0
      ELSE ROUND(SUM(completed_tests)::NUMERIC / SUM(total_tests)::NUMERIC * 100)
    END                    AS completion_percentage,
    COUNT(*)               AS active_book_count
  FROM public.student_book_progress_view
  GROUP BY student_id, workspace_id
)
SELECT
  s.workspace_id,
  s.id                                                  AS student_id,
  s.full_name                                           AS student_full_name,
  s.exam_type,
  s.grade_level,
  s.status                                              AS student_status,
  COALESCE(p.active_book_count, 0)                      AS active_book_count,
  COALESCE(p.total_tests, 0)                            AS total_tests,
  COALESCE(p.completed_tests, 0)                        AS completed_tests,
  COALESCE(p.remaining_tests, 0)                        AS remaining_tests,
  COALESCE(p.completion_percentage, 0)                  AS completion_percentage,
  COALESCE(w.assigned_tests, 0)                         AS current_week_assigned_tests,
  COALESCE(w.completed_tests, 0)                        AS current_week_completed_tests,
  COALESCE(w.overdue_tests, 0)                          AS overdue_tests,
  CASE
    WHEN COALESCE(w.overdue_tests, 0) > 0               THEN 'red'
    WHEN COALESCE(w.assigned_tests, 0) = 0              THEN 'neutral'
    WHEN COALESCE(w.completed_tests, 0) >= COALESCE(w.assigned_tests, 0) THEN 'green'
    ELSE 'yellow'
  END                                                   AS risk_status,
  COALESCE(w.pending_approval_tests, 0)                 AS current_week_pending_approval_tests,
  -- 016'da eklenenler (yalnızca sona):
  COALESCE(o.overdue_items, 0)                          AS total_overdue_items,
  c.last_check_in_at                                    AS last_check_in_at,
  c.pending_check_in_since                              AS pending_check_in_since,
  (c.pending_check_in_since IS NOT NULL)                AS is_check_in_overdue
FROM public.students s
LEFT JOIN progress p ON p.student_id = s.id AND p.workspace_id = s.workspace_id
LEFT JOIN weekly w   ON w.student_id = s.id AND w.workspace_id = s.workspace_id
LEFT JOIN public.student_overdue_homework_view o
       ON o.student_id = s.id AND o.workspace_id = s.workspace_id
LEFT JOIN public.student_check_in_status_view c
       ON c.student_id = s.id AND c.workspace_id = s.workspace_id
WHERE s.status = 'active';
