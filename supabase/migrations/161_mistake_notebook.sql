-- ============================================================
-- 161 — Hata Defteri + Soru/Net takibi (İZ'e EK modül)
--
-- Plan: "Hata Defteri + Soru/Net Takibi" (28.11.2026). Mevcut tablolara,
-- RPC'lere, durum/ilerleme/onay ve finans mantığına DOKUNULMAZ; burada
-- yalnız YENİ tablolar, YENİ fonksiyonlar ve ilk depolama alanı var.
--
-- Hata kaydı öğrencinin BEYANIDIR: kitap ilerlemesine ve öğretmen
-- onayına girmez.
--
-- ERİŞİM
--   öğretmen/sahip : çalışma alanında her şeyi okur; hata ekler, koç notu
--                    yazar, hedef belirler.
--   öğrenci        : yalnız KENDİ kayıtları (is_student_self).
--   veli           : tablolara DOĞRUDAN erişemez; yalnız toplu özet
--                    (parent_mistake_summary). Fotoğraf ve not görmez.
--
-- TEKRAR KUTUSU yalnız record_mistake_review ile değişir; öğrenci koç
-- notunu ve kutuyu doğrudan güncelleyemez (mistakes_guard tetikleyicisi).
-- Kural lib/mistakes/srs.ts ile birebir (parite testi).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tablolar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mistakes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  exam_tag             TEXT NOT NULL DEFAULT 'GENEL' CHECK (exam_tag IN ('TYT', 'AYT', 'LGS', 'GENEL')),
  scope_id             UUID REFERENCES public.academic_scopes(id) ON DELETE SET NULL,
  subject_text         TEXT CHECK (subject_text IS NULL OR length(subject_text) <= 80),
  topic_id             UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  topic_text           TEXT CHECK (topic_text IS NULL OR length(topic_text) <= 120),
  book_id              UUID REFERENCES public.books(id) ON DELETE SET NULL,
  book_test_id         UUID REFERENCES public.book_tests(id) ON DELETE SET NULL,
  source_text          TEXT CHECK (source_text IS NULL OR length(source_text) <= 160),
  page_ref             TEXT CHECK (page_ref IS NULL OR length(page_ref) <= 40),
  reason               TEXT NOT NULL CHECK (reason IN (
                         'bilgi_eksik', 'kavram_yanilgisi', 'islem_hatasi',
                         'dikkatsizlik', 'yanlis_okuma', 'sure_yetmedi')),
  student_answer       TEXT CHECK (student_answer IS NULL OR student_answer IN ('A', 'B', 'C', 'D', 'E', 'bos')),
  correct_answer       TEXT CHECK (correct_answer IS NULL OR correct_answer IN ('A', 'B', 'C', 'D', 'E')),
  solution_note        TEXT CHECK (solution_note IS NULL OR length(solution_note) <= 1000),
  teacher_note         TEXT CHECK (teacher_note IS NULL OR length(teacher_note) <= 1000),
  question_photo_path  TEXT CHECK (question_photo_path IS NULL OR length(question_photo_path) <= 300),
  solution_photo_path  TEXT CHECK (solution_photo_path IS NULL OR length(solution_photo_path) <= 300),
  status               TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'learned', 'archived')),
  box                  SMALLINT NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  next_review_on       DATE,
  last_reviewed_at     TIMESTAMPTZ,
  review_count         INTEGER NOT NULL DEFAULT 0,
  created_by_role      TEXT NOT NULL DEFAULT 'student' CHECK (created_by_role IN ('student', 'teacher')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mistakes_due ON public.mistakes (student_id, status, next_review_on);
CREATE INDEX IF NOT EXISTS idx_mistakes_student_created ON public.mistakes (workspace_id, student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mistake_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  mistake_id    UUID NOT NULL REFERENCES public.mistakes(id) ON DELETE CASCADE,
  reviewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result        TEXT NOT NULL CHECK (result IN ('knew', 'missed')),
  box_after     SMALLINT NOT NULL CHECK (box_after BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_mistake_reviews_student ON public.mistake_reviews (student_id, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS public.question_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  log_date         DATE NOT NULL,
  exam_tag         TEXT NOT NULL DEFAULT 'GENEL' CHECK (exam_tag IN ('TYT', 'AYT', 'LGS', 'GENEL')),
  scope_id         UUID REFERENCES public.academic_scopes(id) ON DELETE SET NULL,
  subject_text     TEXT CHECK (subject_text IS NULL OR length(subject_text) <= 80),
  topic_id         UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  topic_text       TEXT CHECK (topic_text IS NULL OR length(topic_text) <= 120),
  book_id          UUID REFERENCES public.books(id) ON DELETE SET NULL,
  source_text      TEXT CHECK (source_text IS NULL OR length(source_text) <= 160),
  correct          INTEGER NOT NULL DEFAULT 0 CHECK (correct BETWEEN 0 AND 1000),
  wrong            INTEGER NOT NULL DEFAULT 0 CHECK (wrong BETWEEN 0 AND 1000),
  blank            INTEGER NOT NULL DEFAULT 0 CHECK (blank BETWEEN 0 AND 1000),
  penalty_divisor  SMALLINT NOT NULL DEFAULT 4 CHECK (penalty_divisor IN (0, 3, 4)),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT question_logs_nonempty CHECK (correct + wrong + blank > 0)
);

CREATE INDEX IF NOT EXISTS idx_question_logs_student_date ON public.question_logs (student_id, log_date DESC);

CREATE TABLE IF NOT EXISTS public.study_targets (
  student_id       UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  daily_questions  INTEGER NOT NULL DEFAULT 100 CHECK (daily_questions BETWEEN 0 AND 2000),
  daily_reviews    INTEGER NOT NULL DEFAULT 20 CHECK (daily_reviews BETWEEN 0 AND 500),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2) Yardımcı: öğrenci bu çalışma alanının mı (kompozit tutarlılık)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._student_in_workspace(p_student_id UUID, p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id AND s.workspace_id = p_workspace_id);
$$;

REVOKE ALL ON FUNCTION public._student_in_workspace(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._student_in_workspace(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3) RLS
-- ------------------------------------------------------------
ALTER TABLE public.mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistake_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mistakes FROM anon;
REVOKE ALL ON public.mistake_reviews FROM anon;
REVOKE ALL ON public.question_logs FROM anon;
REVOKE ALL ON public.study_targets FROM anon;

-- mistakes
DROP POLICY IF EXISTS mistakes_select ON public.mistakes;
CREATE POLICY mistakes_select ON public.mistakes
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
    OR (SELECT public.is_student_self(student_id))
  );

DROP POLICY IF EXISTS mistakes_insert ON public.mistakes;
CREATE POLICY mistakes_insert ON public.mistakes
  FOR INSERT WITH CHECK (
    (SELECT public._student_in_workspace(student_id, workspace_id))
    AND (
      ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])) AND created_by_role = 'teacher')
      OR ((SELECT public.is_student_self(student_id)) AND created_by_role = 'student')
    )
  );

DROP POLICY IF EXISTS mistakes_update ON public.mistakes;
CREATE POLICY mistakes_update ON public.mistakes
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
    OR (SELECT public.is_student_self(student_id))
  ) WITH CHECK (
    (SELECT public._student_in_workspace(student_id, workspace_id))
  );

DROP POLICY IF EXISTS mistakes_delete ON public.mistakes;
CREATE POLICY mistakes_delete ON public.mistakes
  FOR DELETE USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
    OR ((SELECT public.is_student_self(student_id)) AND created_by_role = 'student')
  );

-- mistake_reviews: okuma; yazma yalnız record_mistake_review
DROP POLICY IF EXISTS mistake_reviews_select ON public.mistake_reviews;
CREATE POLICY mistake_reviews_select ON public.mistake_reviews
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
    OR (SELECT public.is_student_self(student_id))
  );

-- question_logs
DROP POLICY IF EXISTS question_logs_select ON public.question_logs;
CREATE POLICY question_logs_select ON public.question_logs
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
    OR (SELECT public.is_student_self(student_id))
  );

DROP POLICY IF EXISTS question_logs_insert ON public.question_logs;
CREATE POLICY question_logs_insert ON public.question_logs
  FOR INSERT WITH CHECK (
    (SELECT public._student_in_workspace(student_id, workspace_id))
    AND (
      (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
      OR (SELECT public.is_student_self(student_id))
    )
  );

DROP POLICY IF EXISTS question_logs_delete ON public.question_logs;
CREATE POLICY question_logs_delete ON public.question_logs
  FOR DELETE USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
    OR (SELECT public.is_student_self(student_id))
  );

-- study_targets: öğrenci okur, öğretmen yazar
DROP POLICY IF EXISTS study_targets_select ON public.study_targets;
CREATE POLICY study_targets_select ON public.study_targets
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
    OR (SELECT public.is_student_self(student_id))
  );

DROP POLICY IF EXISTS study_targets_insert ON public.study_targets;
CREATE POLICY study_targets_insert ON public.study_targets
  FOR INSERT WITH CHECK (
    (SELECT public._student_in_workspace(student_id, workspace_id))
    AND (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS study_targets_update ON public.study_targets;
CREATE POLICY study_targets_update ON public.study_targets
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  ) WITH CHECK (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

-- ------------------------------------------------------------
-- 4) Koruma tetikleyicisi: öğrenci koç notunu ve tekrar kutusunu
--    doğrudan değiştiremez. Kutu yalnız record_mistake_review ile
--    (oturum ayarı iz.mistake_review = '1') değişir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._mistakes_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_teacher BOOLEAN := public.has_workspace_role(OLD.workspace_id, ARRAY['owner', 'teacher']);
  v_review  BOOLEAN := COALESCE(current_setting('iz.mistake_review', true), '') = '1';
BEGIN
  NEW.workspace_id := OLD.workspace_id;
  NEW.student_id := OLD.student_id;
  NEW.created_by_role := OLD.created_by_role;
  NEW.created_at := OLD.created_at;
  IF NOT v_teacher THEN
    NEW.teacher_note := OLD.teacher_note;
  END IF;
  IF NOT v_review THEN
    NEW.box := OLD.box;
    NEW.next_review_on := OLD.next_review_on;
    NEW.last_reviewed_at := OLD.last_reviewed_at;
    NEW.review_count := OLD.review_count;
    -- Durum: öğrenci/öğretmen yalnız arşivleyebilir ya da arşivden
    -- tekrara alabilir; "öğrenildi" yalnız tekrarla kazanılır.
    IF NEW.status = 'learned' AND OLD.status <> 'learned' THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS mistakes_guard ON public.mistakes;
CREATE TRIGGER mistakes_guard
  BEFORE UPDATE ON public.mistakes
  FOR EACH ROW EXECUTE FUNCTION public._mistakes_guard();

REVOKE ALL ON FUNCTION public._mistakes_guard() FROM PUBLIC, anon;

-- Ekleme: tekrar durumu istemciden ALINMAZ. Yeni hata kutu 1'de, ilk
-- tekrarı BUGÜN (İstanbul günü) — lib/mistakes/srs.ts initialState.
CREATE OR REPLACE FUNCTION public._mistakes_init()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.status := 'review';
  NEW.box := 1;
  NEW.next_review_on := (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE;
  NEW.last_reviewed_at := NULL;
  NEW.review_count := 0;
  -- Koç notunu yalnız öğretmen yazar (öğrenci kaydında boş başlar).
  IF NEW.created_by_role = 'student' THEN
    NEW.teacher_note := NULL;
  END IF;
  NEW.created_at := NOW();
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS mistakes_init ON public.mistakes;
CREATE TRIGGER mistakes_init
  BEFORE INSERT ON public.mistakes
  FOR EACH ROW EXECUTE FUNCTION public._mistakes_init();

REVOKE ALL ON FUNCTION public._mistakes_init() FROM PUBLIC, anon;

-- ------------------------------------------------------------
-- 5) Tekrar kaydı — Leitner (lib/mistakes/srs.ts ile birebir)
--    Aralıklar: kutu 1→1, 2→3, 3→7, 4→14, 5→30 gün.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_mistake_review(p_mistake_id UUID, p_result TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_m      public.mistakes%ROWTYPE;
  v_today  DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE;
  v_box    SMALLINT;
  v_status TEXT;
  v_next   DATE;
BEGIN
  IF p_result NOT IN ('knew', 'missed') THEN
    RAISE EXCEPTION 'Geçersiz tekrar sonucu';
  END IF;

  SELECT * INTO v_m FROM public.mistakes WHERE id = p_mistake_id;
  IF v_m.id IS NULL THEN
    RAISE EXCEPTION 'Hata kaydı bulunamadı';
  END IF;
  IF NOT (public.is_student_self(v_m.student_id)
          OR public.has_workspace_role(v_m.workspace_id, ARRAY['owner', 'teacher'])) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_m.status <> 'review' THEN
    RAISE EXCEPTION 'Bu hata tekrar listesinde değil';
  END IF;

  IF p_result = 'missed' THEN
    v_box := 1;
    v_status := 'review';
    v_next := v_today + 1;
  ELSIF v_m.box >= 5 THEN
    v_box := 5;
    v_status := 'learned';
    v_next := NULL;
  ELSE
    v_box := GREATEST(v_m.box, 1) + 1;
    v_status := 'review';
    v_next := v_today + (CASE v_box WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 7 WHEN 4 THEN 14 ELSE 30 END);
  END IF;

  PERFORM set_config('iz.mistake_review', '1', true);
  UPDATE public.mistakes
     SET box = v_box,
         status = v_status,
         next_review_on = v_next,
         last_reviewed_at = NOW(),
         review_count = review_count + 1
   WHERE id = p_mistake_id;
  PERFORM set_config('iz.mistake_review', '', true);

  INSERT INTO public.mistake_reviews (workspace_id, student_id, mistake_id, result, box_after)
  VALUES (v_m.workspace_id, v_m.student_id, v_m.id, p_result, v_box);

  RETURN jsonb_build_object('box', v_box, 'status', v_status, 'next_review_on', v_next);
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_mistake_review(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_mistake_review(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 6) Veli özeti — yalnız toplu sayılar; fotoğraf/not YOK.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parent_mistake_summary(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN jsonb_build_object(
    'questions_7d', COALESCE((SELECT SUM(correct + wrong + blank) FROM public.question_logs
                              WHERE student_id = p_student_id AND log_date > v_today - 7), 0),
    'net_7d', COALESCE((SELECT ROUND(SUM(CASE WHEN penalty_divisor > 0
                                              THEN correct - wrong::NUMERIC / penalty_divisor
                                              ELSE correct END), 2)
                        FROM public.question_logs
                        WHERE student_id = p_student_id AND log_date > v_today - 7), 0),
    'active_days_7d', COALESCE((SELECT COUNT(DISTINCT log_date) FROM public.question_logs
                                WHERE student_id = p_student_id AND log_date > v_today - 7), 0),
    'reviews_7d', COALESCE((SELECT COUNT(*) FROM public.mistake_reviews
                            WHERE student_id = p_student_id AND reviewed_at > NOW() - INTERVAL '7 days'), 0),
    'in_review', COALESCE((SELECT COUNT(*) FROM public.mistakes
                           WHERE student_id = p_student_id AND status = 'review'), 0),
    'learned', COALESCE((SELECT COUNT(*) FROM public.mistakes
                         WHERE student_id = p_student_id AND status = 'learned'), 0),
    'top_reason', (SELECT reason FROM public.mistakes
                   WHERE student_id = p_student_id AND status <> 'archived'
                   GROUP BY reason ORDER BY COUNT(*) DESC, reason LIMIT 1)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.parent_mistake_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_mistake_summary(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 7) Fotoğraf depolama (İZ'in ilk depolama alanı)
--    Özel alan; yol: {workspace_id}/{student_id}/{dosya}.webp
--    Öğrenci kendi klasörüne yükler/okur/siler; öğretmen çalışma
--    alanınınkini okur/yükler/siler; veli ERİŞEMEZ. Dosya ≤ 600 KB.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mistake-photos', 'mistake-photos', FALSE, 614400, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- Yol → erişim kararı. Bozuk yol (uuid değil) HATA VERMEZ, reddedilir.
CREATE OR REPLACE FUNCTION public._mistake_photo_access(p_name TEXT, p_write BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_parts   TEXT[] := string_to_array(p_name, '/');
  v_ws      UUID;
  v_student UUID;
BEGIN
  IF array_length(v_parts, 1) <> 3 THEN
    RETURN FALSE;
  END IF;
  BEGIN
    v_ws := v_parts[1]::UUID;
    v_student := v_parts[2]::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN FALSE;
  END;
  IF NOT public._student_in_workspace(v_student, v_ws) THEN
    RETURN FALSE;
  END IF;
  RETURN public.has_workspace_role(v_ws, ARRAY['owner', 'teacher'])
      OR public.is_student_self(v_student);
END;
$fn$;

REVOKE ALL ON FUNCTION public._mistake_photo_access(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mistake_photo_access(TEXT, BOOLEAN) TO authenticated;

DROP POLICY IF EXISTS mistake_photos_select ON storage.objects;
CREATE POLICY mistake_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'mistake-photos' AND public._mistake_photo_access(name, FALSE));

DROP POLICY IF EXISTS mistake_photos_insert ON storage.objects;
CREATE POLICY mistake_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mistake-photos' AND public._mistake_photo_access(name, TRUE));

DROP POLICY IF EXISTS mistake_photos_delete ON storage.objects;
CREATE POLICY mistake_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'mistake-photos' AND public._mistake_photo_access(name, TRUE));
