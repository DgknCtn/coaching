-- ============================================================
-- 148 — DERSLER, AKADEMİK GÖREVLER, HAFTAM HAVUZU (M1.0-03, 18.10.2026)
--
-- Kitap, öğrencinin çalışma araçlarından yalnız biridir; DERS akademik
-- operasyonun konteyneridir. Bu dosya kitap takibine DOKUNMAZ
-- (homework_items, Kitap Haritası, Kaynak Planı aynen); kitap dışı işi
-- ayrı bir tabloya alır ve iki giriş aynı haftalık planda birleşir.
--
--   student_courses               öğrencinin Ders Havuzu (0 kaynak ≠ boş ders)
--   academic_tasks                Görev / Checklist / Süre hedefi
--   academic_task_checklist_items checklist alt maddeleri
--
-- ============================================================
-- DURUMLAR
--   draft  öğretmenin taslak sepetinde (öğrenci görmez)
--   open   yayınlandı / öğrenci ekledi — Haftam havuzunda
--   done   öğrenci tamamladı (BEYAN; öğretmen onayı yok, §3)
--   closed öğretmen kapattı (tarihsiz görev için "artık gerekmiyor")
--
-- TARİH ÜÇ AYRI ŞEYDİR:
--   due_at            resmî son teslim (plan teslimi varsayılan; §5)
--   undated           tarihsiz görev — tamamlanana kadar haftalar arası yaşar
--   planned_for_date  öğrencinin kendine verdiği gün; teslimi DEĞİŞTİRMEZ (§7)
--
-- HAFTA GEÇİŞİ (P0 8, 10): haftalar elle açılıyor ve cron yok. Açık
-- tarihsiz görev, aktif hafta değişince roll_open_tasks_to_flow ile yeni
-- haftaya bağlanır ve gün ataması temizlenir. Fonksiyon idempotent;
-- Haftam ve Haftalık Akış açılırken tembel çağrılır (ensure_student_check_ins
-- deseni). origin_flow_id ilk yayın haftasıdır: "Önceki haftadan açık"
-- göstergesi buradan sayılır.
--
-- YAZMA YALNIZ RPC İLE: yetki kuralları (öğrenci öğretmen görevini
-- silemez, metnini/teslimini değiştiremez; takibe alınmış kendi görevini
-- silemez) satır düzeyinde değil işlem düzeyinde; homework_items deseni.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

-- ============================================================
-- 1) DERS HAVUZU
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scope_id     UUID NOT NULL REFERENCES public.academic_scopes(id) ON DELETE CASCADE,
  -- Pasif ders gizlenir, geçmişi silinmez (§2).
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_student_courses_workspace
  ON public.student_courses (workspace_id, student_id);

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_courses;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_courses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.student_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_courses_select ON public.student_courses;
CREATE POLICY student_courses_select ON public.student_courses
  FOR SELECT USING (
    student_courses.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text]))
    OR (SELECT public.is_student_self(student_id))
  );

DROP POLICY IF EXISTS student_courses_write_teacher ON public.student_courses;
CREATE POLICY student_courses_write_teacher ON public.student_courses
  FOR ALL USING (
    student_courses.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))
  )
  WITH CHECK (
    student_courses.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))
    AND (SELECT public.student_workspace_matches(student_id, workspace_id))
  );

-- Öğrenci kendi Haftam'ında ders adını görmeli; academic_scopes yalnız
-- öğretmene açıktı (038). Yalnız KENDİ ders havuzundaki alanlar okunur.
DROP POLICY IF EXISTS academic_scopes_select_student ON public.academic_scopes;
CREATE POLICY academic_scopes_select_student ON public.academic_scopes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_courses sc
      WHERE sc.scope_id = academic_scopes.id
        AND (SELECT public.is_student_self(sc.student_id))
    )
  );

-- Mevcut öğrencilerin ders listesi: müfredat akışı + atanmış kaynaklar
-- (lib/student-scopes.ts'in birleşimi) bir kez havuza yazılır.
INSERT INTO public.student_courses (workspace_id, student_id, scope_id)
SELECT DISTINCT x.workspace_id, x.student_id, x.scope_id
FROM (
  SELECT workspace_id, student_id, scope_id FROM public.student_curriculum_items
  WHERE scope_id IS NOT NULL
  UNION
  SELECT workspace_id, student_id, scope_id FROM public.student_book_assignments
  WHERE scope_id IS NOT NULL AND status <> 'archived'
) x
JOIN public.academic_scopes s ON s.id = x.scope_id AND s.workspace_id = x.workspace_id
ON CONFLICT (student_id, scope_id) DO NOTHING;

-- ============================================================
-- 2) AKADEMİK GÖREVLER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scope_id         UUID NOT NULL REFERENCES public.academic_scopes(id) ON DELETE RESTRICT,
  kind             TEXT NOT NULL CHECK (kind IN ('gorev', 'checklist', 'sure')),
  title            TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  target_minutes   INTEGER CHECK (target_minutes IS NULL OR target_minutes BETWEEN 1 AND 6000),
  done_minutes     INTEGER NOT NULL DEFAULT 0 CHECK (done_minutes BETWEEN 0 AND 6000),
  created_by_role  TEXT NOT NULL CHECK (created_by_role IN ('teacher', 'student')),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Öğrencinin eklediği görevi öğretmen takibe aldı (§8).
  tracked          BOOLEAN NOT NULL DEFAULT FALSE,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'open', 'done', 'closed')),
  due_at           TIMESTAMPTZ,
  undated          BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_flow_id   UUID REFERENCES public.weekly_flows(id) ON DELETE SET NULL,
  origin_flow_id   UUID REFERENCES public.weekly_flows(id) ON DELETE SET NULL,
  planned_for_date DATE,
  published_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  completed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academic_tasks_sure_target CHECK (kind <> 'sure' OR target_minutes IS NOT NULL),
  CONSTRAINT academic_tasks_undated_no_due CHECK (NOT undated OR due_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_academic_tasks_student
  ON public.academic_tasks (student_id, status);
CREATE INDEX IF NOT EXISTS idx_academic_tasks_flow
  ON public.academic_tasks (weekly_flow_id) WHERE weekly_flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_academic_tasks_workspace
  ON public.academic_tasks (workspace_id, student_id);

DROP TRIGGER IF EXISTS handle_updated_at ON public.academic_tasks;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.academic_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.academic_task_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id      UUID NOT NULL REFERENCES public.academic_tasks(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_task
  ON public.academic_task_checklist_items (task_id, order_index);

ALTER TABLE public.academic_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_task_checklist_items ENABLE ROW LEVEL SECURITY;

-- Öğretmen tümünü okur; öğrenci kendi görevlerini (taslak hariç) okur.
-- Veli için politika yok — V1'de veli ekranı bu tabloyu göstermiyor.
DROP POLICY IF EXISTS academic_tasks_select ON public.academic_tasks;
CREATE POLICY academic_tasks_select ON public.academic_tasks
  FOR SELECT USING (
    academic_tasks.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text]))
    OR ((SELECT public.is_student_self(student_id)) AND status <> 'draft')
  );

DROP POLICY IF EXISTS checklist_items_select ON public.academic_task_checklist_items;
CREATE POLICY checklist_items_select ON public.academic_task_checklist_items
  FOR SELECT USING (
    academic_task_checklist_items.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text]))
    OR EXISTS (
      SELECT 1 FROM public.academic_tasks t
      WHERE t.id = academic_task_checklist_items.task_id
        AND t.status <> 'draft'
        AND (SELECT public.is_student_self(t.student_id))
    )
  );

-- Doğrudan yazma yok: her yazma aşağıdaki RPC'lerden geçer.
REVOKE INSERT, UPDATE, DELETE ON public.academic_tasks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.academic_task_checklist_items FROM anon, authenticated;
REVOKE ALL ON public.academic_tasks FROM anon;
REVOKE ALL ON public.academic_task_checklist_items FROM anon;
REVOKE ALL ON public.student_courses FROM anon;
GRANT SELECT ON public.academic_tasks TO authenticated;
GRANT SELECT ON public.academic_task_checklist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_courses TO authenticated;

-- ============================================================
-- 3) YETKİ YARDIMCISI
--   'teacher' — o alanın owner/teacher'ı
--   'student' — görevin öğrencisi
--   NULL      — erişim yok
-- ============================================================
CREATE OR REPLACE FUNCTION public.academic_task_actor(p_workspace_id UUID, p_student_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RETURN 'teacher';
  END IF;
  IF public.is_student_self(p_student_id) THEN
    RETURN 'student';
  END IF;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.academic_task_actor(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academic_task_actor(UUID, UUID) TO authenticated;

-- ============================================================
-- 4) OLUŞTUR
--
-- Öğretmen: p_publish FALSE → taslak sepet; TRUE → aktif haftaya doğrudan
-- ("Bu haftaya ekle", §3). Öğrenci: her zaman açık, tarihsiz, kendi
-- görevi (§8). Ders öğrencinin aktif Ders Havuzunda olmalı.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_academic_task(
  p_student_id     UUID,
  p_scope_id       UUID,
  p_kind           TEXT,
  p_title          TEXT,
  p_target_minutes INTEGER DEFAULT NULL,
  p_checklist      TEXT[]  DEFAULT NULL,
  p_undated        BOOLEAN DEFAULT FALSE,
  p_due_at         TIMESTAMPTZ DEFAULT NULL,
  p_publish        BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_actor     TEXT;
  v_flow      public.weekly_flows%ROWTYPE;
  v_status    TEXT;
  v_due       TIMESTAMPTZ;
  v_undated   BOOLEAN := COALESCE(p_undated, FALSE);
  v_id        UUID;
  v_item      TEXT;
  v_i         INTEGER := 0;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  v_actor := public.academic_task_actor(v_workspace, p_student_id);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_kind NOT IN ('gorev', 'checklist', 'sure') THEN
    RAISE EXCEPTION 'Geçersiz görev türü';
  END IF;
  IF p_kind = 'sure' AND (p_target_minutes IS NULL OR p_target_minutes < 1) THEN
    RAISE EXCEPTION 'Süre hedefi için dakika girin';
  END IF;
  IF length(btrim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'Görev metni boş olamaz';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_courses
    WHERE student_id = p_student_id AND scope_id = p_scope_id AND active
  ) THEN
    RAISE EXCEPTION 'Bu ders öğrencinin aktif dersleri arasında değil';
  END IF;

  SELECT * INTO v_flow FROM public.weekly_flows
  WHERE student_id = p_student_id AND status = 'active'
  LIMIT 1;

  IF v_actor = 'student' THEN
    v_status := 'open';
    -- Öğrencinin kendi çalışması tarihsizdir; teslimi yoktur.
    v_undated := TRUE;
    v_due := NULL;
  ELSIF COALESCE(p_publish, FALSE) THEN
    IF v_flow.id IS NULL THEN
      RAISE EXCEPTION 'Açık bir çalışma haftası yok; görevi plana bırakın';
    END IF;
    v_status := 'open';
    v_due := CASE WHEN v_undated THEN NULL ELSE COALESCE(p_due_at, v_flow.due_at) END;
  ELSE
    v_status := 'draft';
    v_due := CASE WHEN v_undated THEN NULL ELSE p_due_at END;
  END IF;

  INSERT INTO public.academic_tasks (
    workspace_id, student_id, scope_id, kind, title, target_minutes,
    created_by_role, created_by_profile_id, status, due_at, undated,
    weekly_flow_id, origin_flow_id, published_at
  )
  VALUES (
    v_workspace, p_student_id, p_scope_id, p_kind, btrim(p_title),
    CASE WHEN p_kind = 'sure' THEN p_target_minutes ELSE NULL END,
    v_actor, public.current_profile_id(), v_status, v_due, v_undated,
    CASE WHEN v_status = 'open' THEN v_flow.id END,
    CASE WHEN v_status = 'open' THEN v_flow.id END,
    CASE WHEN v_status = 'open' THEN NOW() END
  )
  RETURNING id INTO v_id;

  IF p_kind = 'checklist' AND p_checklist IS NOT NULL THEN
    FOREACH v_item IN ARRAY p_checklist LOOP
      IF length(btrim(COALESCE(v_item, ''))) > 0 THEN
        INSERT INTO public.academic_task_checklist_items (workspace_id, task_id, title, order_index)
        VALUES (v_workspace, v_id, left(btrim(v_item), 200), v_i);
        v_i := v_i + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_academic_task(UUID, UUID, TEXT, TEXT, INTEGER, TEXT[], BOOLEAN, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_academic_task(UUID, UUID, TEXT, TEXT, INTEGER, TEXT[], BOOLEAN, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- ============================================================
-- 5) DÜZENLE / SİL
-- Öğrenci yalnız KENDİ görevini düzenler; takibe alınmışsa silemez (§8).
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_academic_task(
  p_task_id        UUID,
  p_title          TEXT,
  p_target_minutes INTEGER DEFAULT NULL,
  p_undated        BOOLEAN DEFAULT NULL,
  p_due_at         TIMESTAMPTZ DEFAULT NULL,
  p_clear_due      BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_task  public.academic_tasks%ROWTYPE;
  v_actor TEXT;
  v_undated BOOLEAN;
BEGIN
  SELECT * INTO v_task FROM public.academic_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;
  v_actor := public.academic_task_actor(v_task.workspace_id, v_task.student_id);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_actor = 'student' AND v_task.created_by_role <> 'student' THEN
    RAISE EXCEPTION 'Öğretmenin verdiği görevin metni ve teslimi değiştirilemez';
  END IF;
  IF length(btrim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'Görev metni boş olamaz';
  END IF;
  IF v_task.kind = 'sure' AND p_target_minutes IS NOT NULL AND p_target_minutes < 1 THEN
    RAISE EXCEPTION 'Süre hedefi için dakika girin';
  END IF;

  -- Teslim tarihini yalnız öğretmen yönetir; öğrencinin görevi tarihsizdir.
  v_undated := CASE WHEN v_actor = 'student' THEN v_task.undated ELSE COALESCE(p_undated, v_task.undated) END;

  UPDATE public.academic_tasks
  SET title          = btrim(p_title),
      target_minutes = CASE WHEN kind = 'sure' THEN COALESCE(p_target_minutes, target_minutes) ELSE NULL END,
      undated        = v_undated,
      due_at         = CASE
                         WHEN v_undated THEN NULL
                         WHEN v_actor = 'student' THEN due_at
                         WHEN p_clear_due THEN NULL
                         ELSE COALESCE(p_due_at, due_at)
                       END
  WHERE id = p_task_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_academic_task(UUID, TEXT, INTEGER, BOOLEAN, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_academic_task(UUID, TEXT, INTEGER, BOOLEAN, TIMESTAMPTZ, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_academic_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_task  public.academic_tasks%ROWTYPE;
  v_actor TEXT;
BEGIN
  SELECT * INTO v_task FROM public.academic_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;
  v_actor := public.academic_task_actor(v_task.workspace_id, v_task.student_id);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_actor = 'student' AND v_task.created_by_role <> 'student' THEN
    RAISE EXCEPTION 'Öğretmenin verdiği görev silinemez';
  END IF;
  IF v_actor = 'student' AND v_task.tracked THEN
    RAISE EXCEPTION 'Öğretmenin takibe aldığı görev silinemez';
  END IF;

  DELETE FROM public.academic_tasks WHERE id = p_task_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_academic_task(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_academic_task(UUID) TO authenticated;

-- ============================================================
-- 6) PLANLAMA VE İLERLEME (öğrenci veya öğretmen)
-- ============================================================

-- Güne yerleştirme: yalnız planned_for_date; due_at değişmez (§7).
CREATE OR REPLACE FUNCTION public.set_academic_task_plan_date(p_task_id UUID, p_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_task public.academic_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM public.academic_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;
  IF public.academic_task_actor(v_task.workspace_id, v_task.student_id) IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_task.status = 'draft' OR v_task.status = 'closed' THEN
    RAISE EXCEPTION 'Bu görev planlanamaz';
  END IF;

  UPDATE public.academic_tasks SET planned_for_date = p_date WHERE id = p_task_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_academic_task_plan_date(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_academic_task_plan_date(UUID, DATE) TO authenticated;

-- Tamamlandı tiki öğrencinin beyanıdır (§3). Checklist'te alt maddeler,
-- süre hedefinde dakika durumu belirler; bu fonksiyon yalnız 'gorev' ve
-- elle "bitti" demek içindir.
CREATE OR REPLACE FUNCTION public.set_academic_task_done(p_task_id UUID, p_done BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_task public.academic_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM public.academic_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;
  IF public.academic_task_actor(v_task.workspace_id, v_task.student_id) IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_task.status NOT IN ('open', 'done') THEN
    RAISE EXCEPTION 'Bu görev tamamlanamaz';
  END IF;

  UPDATE public.academic_tasks
  SET status = CASE WHEN p_done THEN 'done' ELSE 'open' END,
      completed_at = CASE WHEN p_done THEN COALESCE(completed_at, NOW()) ELSE NULL END,
      completed_by_profile_id = CASE WHEN p_done THEN public.current_profile_id() ELSE NULL END
  WHERE id = p_task_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_academic_task_done(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_academic_task_done(UUID, BOOLEAN) TO authenticated;

-- Alt madde tiki; hepsi tikliyse görev tamamlanır, biri açılırsa geri döner.
CREATE OR REPLACE FUNCTION public.toggle_checklist_item(p_item_id UUID, p_done BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_task public.academic_tasks%ROWTYPE;
  v_all  BOOLEAN;
BEGIN
  SELECT t.* INTO v_task
  FROM public.academic_task_checklist_items i
  JOIN public.academic_tasks t ON t.id = i.task_id
  WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Madde bulunamadı';
  END IF;
  IF public.academic_task_actor(v_task.workspace_id, v_task.student_id) IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_task.status NOT IN ('open', 'done') THEN
    RAISE EXCEPTION 'Bu görev güncellenemez';
  END IF;

  UPDATE public.academic_task_checklist_items SET done = p_done WHERE id = p_item_id;

  SELECT bool_and(done) INTO v_all
  FROM public.academic_task_checklist_items WHERE task_id = v_task.id;

  UPDATE public.academic_tasks
  SET status = CASE WHEN v_all THEN 'done' ELSE 'open' END,
      completed_at = CASE WHEN v_all THEN COALESCE(completed_at, NOW()) ELSE NULL END,
      completed_by_profile_id = CASE WHEN v_all THEN public.current_profile_id() ELSE NULL END
  WHERE id = v_task.id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.toggle_checklist_item(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_checklist_item(UUID, BOOLEAN) TO authenticated;

-- Süre hedefi ilerlemesi: haftalık toplam dakika (85/120). V1'de güne
-- parçalama yok (§7). Hedefe ulaşınca görev tamamlanır.
CREATE OR REPLACE FUNCTION public.set_academic_task_minutes(p_task_id UUID, p_minutes INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_task public.academic_tasks%ROWTYPE;
  v_done BOOLEAN;
BEGIN
  SELECT * INTO v_task FROM public.academic_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;
  IF public.academic_task_actor(v_task.workspace_id, v_task.student_id) IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_task.kind <> 'sure' THEN
    RAISE EXCEPTION 'Dakika yalnız süre hedefine girilir';
  END IF;
  IF v_task.status NOT IN ('open', 'done') THEN
    RAISE EXCEPTION 'Bu görev güncellenemez';
  END IF;
  IF p_minutes IS NULL OR p_minutes < 0 OR p_minutes > 6000 THEN
    RAISE EXCEPTION 'Geçerli bir dakika girin';
  END IF;

  v_done := p_minutes >= v_task.target_minutes;
  UPDATE public.academic_tasks
  SET done_minutes = p_minutes,
      status = CASE WHEN v_done THEN 'done' ELSE 'open' END,
      completed_at = CASE WHEN v_done THEN COALESCE(completed_at, NOW()) ELSE NULL END,
      completed_by_profile_id = CASE WHEN v_done THEN public.current_profile_id() ELSE NULL END
  WHERE id = p_task_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_academic_task_minutes(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_academic_task_minutes(UUID, INTEGER) TO authenticated;

-- ============================================================
-- 7) ÖĞRETMEN İŞLEMLERİ
-- ============================================================

-- Öğrencinin kendi görevini takibe al / bırak (§8).
CREATE OR REPLACE FUNCTION public.set_academic_task_tracked(p_task_id UUID, p_tracked BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_task public.academic_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM public.academic_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;
  IF public.academic_task_actor(v_task.workspace_id, v_task.student_id) IS DISTINCT FROM 'teacher' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  UPDATE public.academic_tasks SET tracked = COALESCE(p_tracked, FALSE) WHERE id = p_task_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_academic_task_tracked(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_academic_task_tracked(UUID, BOOLEAN) TO authenticated;

-- Tarihsiz görevi öğretmen kapatır ("artık gerekmiyor") ya da yeniden açar.
CREATE OR REPLACE FUNCTION public.set_academic_task_closed(p_task_id UUID, p_closed BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_task public.academic_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM public.academic_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;
  IF public.academic_task_actor(v_task.workspace_id, v_task.student_id) IS DISTINCT FROM 'teacher' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_task.status = 'draft' THEN
    RAISE EXCEPTION 'Taslak görev kapatılmaz; sepetten çıkarın';
  END IF;
  UPDATE public.academic_tasks
  SET status = CASE WHEN p_closed THEN 'closed' WHEN completed_at IS NOT NULL THEN 'done' ELSE 'open' END
  WHERE id = p_task_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_academic_task_closed(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_academic_task_closed(UUID, BOOLEAN) TO authenticated;

-- Planı Yayınla: öğretmenin bu öğrenci için taslak görevleri aktif haftaya.
-- Plan son teslimi varsayılandır; satır istisnası (farklı tarih, tarihsiz)
-- korunur (§5).
CREATE OR REPLACE FUNCTION public.publish_draft_academic_tasks(
  p_student_id UUID,
  p_due_at     TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_flow      public.weekly_flows%ROWTYPE;
  v_count     INTEGER;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_flow FROM public.weekly_flows
  WHERE student_id = p_student_id AND status = 'active'
  LIMIT 1;
  IF v_flow.id IS NULL THEN
    RAISE EXCEPTION 'Açık bir çalışma haftası yok; önce Haftalık Akış''tan haftayı açın';
  END IF;

  UPDATE public.academic_tasks
  SET status = 'open',
      due_at = CASE WHEN undated THEN NULL ELSE COALESCE(due_at, p_due_at, v_flow.due_at) END,
      weekly_flow_id = v_flow.id,
      origin_flow_id = v_flow.id,
      published_at = NOW()
  WHERE student_id = p_student_id
    AND status = 'draft'
    AND created_by_profile_id IS NOT DISTINCT FROM public.current_profile_id();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.publish_draft_academic_tasks(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_draft_academic_tasks(UUID, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- 8) HAFTA GEÇİŞİ (P0 8, 10) — idempotent, tembel
--
-- Açık TARİHSİZ görev aktif haftaya bağlı değilse yeni haftaya geçer ve
-- gün ataması temizlenir: yeni haftanın havuzuna normal açık görev olarak
-- döner. Tarihli açık görev eski haftasında kalır (geç teslim gibi);
-- Haftam onu "önceki haftadan" diye havuzda gösterir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.roll_open_tasks_to_flow(p_student_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_flow_id   UUID;
  v_count     INTEGER;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF public.academic_task_actor(v_workspace, p_student_id) IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT id INTO v_flow_id FROM public.weekly_flows
  WHERE student_id = p_student_id AND status = 'active'
  LIMIT 1;
  IF v_flow_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.academic_tasks
  SET weekly_flow_id = v_flow_id,
      origin_flow_id = COALESCE(origin_flow_id, v_flow_id),
      planned_for_date = NULL
  WHERE student_id = p_student_id
    AND status = 'open'
    AND undated
    AND weekly_flow_id IS DISTINCT FROM v_flow_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.roll_open_tasks_to_flow(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roll_open_tasks_to_flow(UUID) TO authenticated;

DO $dogrula$
BEGIN
  IF has_table_privilege('authenticated', 'public.academic_tasks', 'INSERT') THEN
    RAISE EXCEPTION '148 DOĞRULAMA: academic_tasks doğrudan yazılabiliyor.';
  END IF;
  IF has_function_privilege('anon', 'public.create_academic_task(uuid, uuid, text, text, integer, text[], boolean, timestamp with time zone, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '148 DOĞRULAMA: create_academic_task anon''a açık.';
  END IF;
END;
$dogrula$;

-- ============================================================
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.roll_open_tasks_to_flow(UUID);
--   DROP FUNCTION IF EXISTS public.publish_draft_academic_tasks(UUID, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public.set_academic_task_closed(UUID, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.set_academic_task_tracked(UUID, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.set_academic_task_minutes(UUID, INTEGER);
--   DROP FUNCTION IF EXISTS public.toggle_checklist_item(UUID, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.set_academic_task_done(UUID, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.set_academic_task_plan_date(UUID, DATE);
--   DROP FUNCTION IF EXISTS public.delete_academic_task(UUID);
--   DROP FUNCTION IF EXISTS public.update_academic_task(UUID, TEXT, INTEGER, BOOLEAN, TIMESTAMPTZ, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.create_academic_task(UUID, UUID, TEXT, TEXT, INTEGER, TEXT[], BOOLEAN, TIMESTAMPTZ, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.academic_task_actor(UUID, UUID);
--   DROP POLICY IF EXISTS academic_scopes_select_student ON public.academic_scopes;
--   DROP TABLE IF EXISTS public.academic_task_checklist_items;
--   DROP TABLE IF EXISTS public.academic_tasks;
--   DROP TABLE IF EXISTS public.student_courses;
-- ============================================================
