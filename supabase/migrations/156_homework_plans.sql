-- ============================================================
-- 156 — Ödev Planı kaydı · Revize Mini 05 + Mini 06 (1. aşama)
--
-- "Ödev Planı" bugüne dek ayrı bir kayıt değildi: her yayın yeni bir
-- homework_batches satırı açıyor, başlık serbest metin ("5. Hafta Ödevi")
-- olarak tutuluyordu. Testte görülenler:
--   - aynı başlıklı birden fazla yayımlanmış kart (her ekleme yeni parti),
--   - devirden sonra ilk planın 2/6 → 2/4 görünmesi (iptal kalemler
--     toplamdan düşülüyordu — ekran tarafında düzeltildi),
--   - kitapsız (yalnız görev) planın hiç kaydı olmaması.
--
-- MODEL
--   homework_plans: öğrenci başına sıralı plan (plan_no). Numara YALNIZ yeni
--   ve ayrı bir plan yayımlanınca alınır; taslak, iptal, kitap değiştirme,
--   hafta geçişi, teslim uzatma, plana ekleme numara üretmez.
--   Bir planın EN FAZLA BİR kitap partisi olur: "Planı güncelle" kalemleri
--   aynı partiye ekler — öğretmen, öğrenci ve veli ekranlarında plan başına
--   tek kart. İlk kapsam / sonradan ekleme homework_items.created_at ile
--   published_at karşılaştırılarak ayrışır.
--   Görevler (academic_tasks) plan_id ile plana bağlanır.
--
-- BAŞLIK: numaralı ön ek sistemden ("3. Ödev Planı"), açıklama öğretmenden
-- (" · Yazılı Hazırlığı"). Sıra başlığın içindeki rakamdan hesaplanmaz.
-- Eski kayıtların başlığı (legacy_title) AYNEN korunur.
--
-- KAPANIŞ: öğretmen kapatır (karar). Kapanışta sonuç closing_result'a
-- yazılır; sonraki tamamlamalar kapanmış planın sonucunu değiştirmez.
-- Yeni plan yayımlamak eskisini kapatmaz.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Tablo ve bağlar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homework_plans (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id             UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  plan_no                INTEGER NOT NULL CHECK (plan_no > 0),
  title_suffix           TEXT CHECK (title_suffix IS NULL OR length(title_suffix) <= 160),
  legacy_title           TEXT,
  published_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  initial_due_at         TIMESTAMPTZ,
  due_at                 TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at              TIMESTAMPTZ,
  closed_by_profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closing_result         JSONB,
  created_by_profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, plan_no)
);

CREATE INDEX IF NOT EXISTS idx_homework_plans_student
  ON public.homework_plans (student_id, plan_no DESC);

ALTER TABLE public.homework_plans ENABLE ROW LEVEL SECURITY;

-- Öğretmen/sahip/asistan kendi alanının planlarını OKUR. Yazma yalnız
-- aşağıdaki SECURITY DEFINER RPC'lerle. Öğrenci/veli tabloyu okumaz;
-- parti başlığını (homework_batches.title) görür.
DROP POLICY IF EXISTS homework_plans_select ON public.homework_plans;
CREATE POLICY homework_plans_select ON public.homework_plans
  FOR SELECT TO authenticated USING (
    homework_plans.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text]))
  );

ALTER TABLE public.homework_batches
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.homework_plans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_homework_batches_plan ON public.homework_batches (plan_id);

ALTER TABLE public.academic_tasks
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.homework_plans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_academic_tasks_plan ON public.academic_tasks (plan_id);


-- ------------------------------------------------------------
-- 2) İç yardımcılar (istemciye açık değil)
-- ------------------------------------------------------------

-- Gösterim başlığı — lib/homework-plan.ts planDisplayTitle ile AYNI kural.
CREATE OR REPLACE FUNCTION public._homework_plan_title(p_plan public.homework_plans)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    p_plan.legacy_title,
    p_plan.plan_no || '. Ödev Planı' ||
      CASE WHEN COALESCE(btrim(p_plan.title_suffix), '') = '' THEN '' ELSE ' · ' || btrim(p_plan.title_suffix) END
  );
$fn$;

REVOKE ALL ON FUNCTION public._homework_plan_title(public.homework_plans) FROM PUBLIC, anon, authenticated;

-- Plan sonucu — lib/homework-plan.ts planResult ile AYNI tanımlar.
--   verilen   = partideki TÜM kalemler (devredilen/çıkarılan dahil)
--   devredilen= iptal + carried_to dolu; çıkarılan = iptal + carried_to boş
--   onay bekleyen "yapılmadı" sayılmaz
CREATE OR REPLACE FUNCTION public._homework_plan_result(p_plan_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'given',            COUNT(hi.id),
    'done',             COUNT(hi.id) FILTER (WHERE hi.status = 'completed'),
    'pending_approval', COUNT(hi.id) FILTER (WHERE hi.status = 'pending_approval'),
    'remaining',        COUNT(hi.id) FILTER (WHERE hi.status = 'pending'),
    'carried',          COUNT(hi.id) FILTER (WHERE hi.status = 'cancelled' AND hi.carried_to_item_id IS NOT NULL),
    'released',         COUNT(hi.id) FILTER (WHERE hi.status = 'cancelled' AND hi.carried_to_item_id IS NULL),
    'tasks_done',       (SELECT COUNT(*) FROM public.academic_tasks t WHERE t.plan_id = p_plan_id AND t.status = 'done'),
    'tasks_open',       (SELECT COUNT(*) FROM public.academic_tasks t WHERE t.plan_id = p_plan_id AND t.status = 'open'),
    'tasks_closed',     (SELECT COUNT(*) FROM public.academic_tasks t WHERE t.plan_id = p_plan_id AND t.status = 'closed')
  )
  FROM public.homework_batches hb
  LEFT JOIN public.homework_items hi ON hi.homework_batch_id = hb.id
  WHERE hb.plan_id = p_plan_id;
$fn$;

REVOKE ALL ON FUNCTION public._homework_plan_result(UUID) FROM PUBLIC, anon, authenticated;

-- Yeni plan: numara burada ve YALNIZ burada alınır. Öğrenci satırı
-- kilitlenir — eş zamanlı iki yayın aynı numarayı alamaz.
CREATE OR REPLACE FUNCTION public._open_homework_plan(
  p_student_id UUID,
  p_suffix     TEXT,
  p_due_at     TIMESTAMPTZ
)
RETURNS public.homework_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_no        INTEGER;
  v_plan      public.homework_plans;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id FOR UPDATE;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'Öğrenci bulunamadı'; END IF;

  SELECT COALESCE(MAX(plan_no), 0) + 1 INTO v_no
  FROM public.homework_plans WHERE student_id = p_student_id;

  INSERT INTO public.homework_plans (
    workspace_id, student_id, plan_no, title_suffix,
    initial_due_at, due_at, created_by_profile_id
  ) VALUES (
    v_workspace, p_student_id, v_no, NULLIF(btrim(COALESCE(p_suffix, '')), ''),
    p_due_at, p_due_at, public.current_profile_id()
  ) RETURNING * INTO v_plan;

  RETURN v_plan;
END;
$fn$;

REVOKE ALL ON FUNCTION public._open_homework_plan(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 3) Geçiş: mevcut her parti bir plan olur — başlıklar DEĞİŞMEZ
--
-- Numara öğrencinin partilerinin created_at sırasıyla verilir (gerçek
-- kayıt sırası). "5. Hafta Ödevi" başlığından beş plan varsayılmaz.
-- Plan kimliği parti kimliğiyle aynıdır: eşleme tek adımda kurulur ve
-- dosya yeniden çalıştırılırsa aynı partiye ikinci plan açılmaz.
-- ------------------------------------------------------------
INSERT INTO public.homework_plans (
  id, workspace_id, student_id, plan_no, legacy_title,
  published_at, initial_due_at, due_at, status, created_by_profile_id, created_at
)
SELECT
  hb.id, hb.workspace_id, hb.student_id,
  COALESCE((SELECT MAX(p.plan_no) FROM public.homework_plans p WHERE p.student_id = hb.student_id), 0)
    + ROW_NUMBER() OVER (PARTITION BY hb.student_id ORDER BY hb.created_at, hb.id),
  COALESCE(NULLIF(btrim(hb.title), ''), 'Ödev'),
  hb.created_at,
  COALESCE(hb.due_at, (hb.due_date + TIME '18:00') AT TIME ZONE 'Europe/Istanbul'),
  COALESCE(hb.due_at, (hb.due_date + TIME '18:00') AT TIME ZONE 'Europe/Istanbul'),
  'open',
  hb.assigned_by_profile_id,
  hb.created_at
FROM public.homework_batches hb
WHERE hb.plan_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.homework_plans p WHERE p.id = hb.id)
ON CONFLICT DO NOTHING;

UPDATE public.homework_batches hb
   SET plan_id = hb.id
 WHERE hb.plan_id IS NULL
   AND EXISTS (SELECT 1 FROM public.homework_plans p WHERE p.id = hb.id);

-- Açık kalemi kalmamış ya da aktif yükten çıkarılmış eski plan kapalıdır;
-- sonucu bugünkü durumdan yazılır.
UPDATE public.homework_plans p
   SET status = 'closed',
       closed_at = hb.updated_at,
       closing_result = public._homework_plan_result(p.id)
  FROM public.homework_batches hb
 WHERE hb.id = p.id
   AND p.legacy_title IS NOT NULL
   AND p.status = 'open'
   AND (
     hb.status <> 'active'
     OR NOT EXISTS (
       SELECT 1 FROM public.homework_items hi
       WHERE hi.homework_batch_id = hb.id AND hi.status IN ('pending', 'pending_approval')
     )
   );


-- ------------------------------------------------------------
-- 4) create_homework_batch — plana yayın / plana ekleme
--
-- p_plan_id boş: yeni plan + parti. Dolu: plan açık ve aynı öğrencininse
-- kalemler planın partisine EKLENİR (yeni parti açılmaz; parti yoksa
-- — yalnız görevli plan — oluşturulur). Mevcut plana eklerken teslim
-- planınkidir; teslim değişikliği set_homework_plan_due ile yapılır.
-- Mini 02'nin carry dalı (155) aynen korunur. p_title kalktı: başlık
-- plandan üretilir.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.create_homework_batch(
  p_workspace_id      UUID,
  p_academic_term_id  UUID,
  p_student_id        UUID,
  p_due_date          DATE,
  p_description       TEXT DEFAULT NULL,
  p_items             JSONB DEFAULT '[]'::JSONB,
  p_due_at            TIMESTAMPTZ DEFAULT NULL,
  p_plan_id           UUID DEFAULT NULL,
  p_title_suffix      TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id    UUID;
  v_plan          public.homework_plans;
  v_created_plan  BOOLEAN := FALSE;
  v_created_batch BOOLEAN := FALSE;
  v_batch_id      UUID;
  v_item          JSONB;
  v_sba_id        UUID;
  v_test_id       UUID;
  v_book_id       UUID;
  v_section_id    UUID;
  v_due_at        TIMESTAMPTZ;
  v_carry         BOOLEAN;
  v_source        public.homework_items%ROWTYPE;
  v_existing      public.homework_items%ROWTYPE;
  v_new_item      UUID;
  v_carried       INTEGER := 0;
  v_added         INTEGER := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = p_student_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Student does not belong to this workspace';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Homework batch must have at least one item';
  END IF;

  IF p_plan_id IS NULL THEN
    v_due_at := COALESCE(p_due_at, (p_due_date + TIME '18:00') AT TIME ZONE 'Europe/Istanbul');
    v_plan := public._open_homework_plan(p_student_id, p_title_suffix, v_due_at);
    v_created_plan := TRUE;
  ELSE
    SELECT * INTO v_plan FROM public.homework_plans WHERE id = p_plan_id FOR UPDATE;
    IF v_plan.id IS NULL OR v_plan.student_id <> p_student_id OR v_plan.workspace_id <> p_workspace_id THEN
      RAISE EXCEPTION 'Ödev planı bulunamadı';
    END IF;
    IF v_plan.status <> 'open' THEN
      RAISE EXCEPTION 'Bu ödev planı kapatılmış; yeni plan yayımlayın';
    END IF;
    -- Açıklama sepetten değiştirildiyse plana yazılır (numara değişmez).
    IF p_title_suffix IS NOT NULL
       AND NULLIF(btrim(p_title_suffix), '') IS DISTINCT FROM v_plan.title_suffix THEN
      UPDATE public.homework_plans
         SET title_suffix = NULLIF(btrim(p_title_suffix), ''), legacy_title = NULL, updated_at = NOW()
       WHERE id = v_plan.id
      RETURNING * INTO v_plan;
    END IF;
    v_due_at := v_plan.due_at;
  END IF;

  SELECT id INTO v_batch_id FROM public.homework_batches
  WHERE plan_id = v_plan.id
  ORDER BY created_at
  LIMIT 1;

  IF v_batch_id IS NULL THEN
    INSERT INTO public.homework_batches (
      workspace_id, academic_term_id, student_id, title, description,
      due_date, due_at, assigned_by_profile_id, plan_id
    ) VALUES (
      p_workspace_id, p_academic_term_id, p_student_id, public._homework_plan_title(v_plan), p_description,
      COALESCE((v_due_at AT TIME ZONE 'Europe/Istanbul')::DATE, p_due_date), v_due_at, v_profile_id, v_plan.id
    ) RETURNING id INTO v_batch_id;
    v_created_batch := TRUE;
  ELSE
    -- Plana ekleme: tamamen çıkarılmış (arşivlenmiş) parti yeniden etkin olur.
    UPDATE public.homework_batches
       SET status = 'active',
           title = public._homework_plan_title(v_plan),
           description = COALESCE(NULLIF(btrim(COALESCE(p_description, '')), ''), description),
           updated_at = NOW()
     WHERE id = v_batch_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sba_id  := (v_item->>'student_book_assignment_id')::UUID;
    v_test_id := (v_item->>'book_test_id')::UUID;
    v_carry   := COALESCE((v_item->>'carry')::BOOLEAN, FALSE);
    v_source  := NULL;
    v_existing := NULL;

    SELECT sba.book_id INTO v_book_id
    FROM public.student_book_assignments sba
    WHERE sba.id = v_sba_id AND sba.workspace_id = p_workspace_id;

    IF v_book_id IS NULL THEN
      RAISE EXCEPTION 'Invalid student_book_assignment_id: %', v_sba_id;
    END IF;

    SELECT section_id INTO v_section_id
    FROM public.book_tests
    WHERE id = v_test_id AND book_id = v_book_id AND status = 'active';

    IF v_section_id IS NULL THEN
      RAISE EXCEPTION 'book_test_id % does not belong to the assigned book', v_test_id;
    END IF;

    -- Bu birim bu planın partisinde zaten var mı?
    SELECT * INTO v_existing FROM public.homework_items
    WHERE homework_batch_id = v_batch_id AND book_test_id = v_test_id;

    IF v_existing.id IS NOT NULL THEN
      IF v_existing.status IN ('pending', 'pending_approval', 'completed') THEN
        -- Aynı plana ikinci kez: iş zaten planda; kopya üretilmez.
        CONTINUE;
      END IF;
      IF v_existing.carried_to_item_id IS NOT NULL THEN
        RAISE EXCEPTION 'Bu çalışma bu plandan başka plana devredilmiş; aynı plana yeniden eklenemez';
      END IF;
    END IF;

    IF v_carry THEN
      IF EXISTS (
        SELECT 1
        FROM public.homework_items hi
        JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
        WHERE hb.student_id = p_student_id
          AND hi.book_test_id = v_test_id
          AND hi.status = 'pending_approval'
      ) THEN
        RAISE EXCEPTION 'Öğrenci bu çalışmayı teslim etti; devredilemez. Sepetten çıkarıp yeniden yayınlayın.';
      END IF;

      SELECT hi.* INTO v_source
      FROM public.homework_items hi
      JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
      WHERE hb.student_id = p_student_id
        AND hi.book_test_id = v_test_id
        AND hi.status = 'pending'
        AND hi.carried_to_item_id IS NULL
      ORDER BY hi.created_at DESC
      LIMIT 1;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.homework_items hi
        JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
        WHERE hb.student_id = p_student_id
          AND hi.book_test_id = v_test_id
          AND hi.status IN ('pending', 'pending_approval')
      ) THEN
        RAISE EXCEPTION 'Bu test öğrenciye zaten ödev olarak atanmış (bekleyen bir ödev kaydı var).';
      END IF;
    END IF;

    IF v_existing.id IS NOT NULL THEN
      -- Bu planda aktif yükten çıkarılmış kalem yeniden açılır (kopya değil).
      UPDATE public.homework_items
         SET status = 'pending',
             released_at = NULL,
             released_by_profile_id = NULL,
             release_reason = NULL,
             carried_from_item_id = COALESCE(carried_from_item_id, v_source.id),
             updated_at = NOW()
       WHERE id = v_existing.id
      RETURNING id INTO v_new_item;
    ELSE
      INSERT INTO public.homework_items (
        workspace_id, homework_batch_id, student_book_assignment_id,
        book_id, section_id, book_test_id, carried_from_item_id
      ) VALUES (
        p_workspace_id, v_batch_id, v_sba_id,
        v_book_id, v_section_id, v_test_id, v_source.id
      ) RETURNING id INTO v_new_item;
    END IF;
    v_added := v_added + 1;

    IF v_source.id IS NOT NULL THEN
      UPDATE public.homework_items hi
         SET status = 'cancelled',
             released_at = NOW(),
             released_by_profile_id = v_profile_id,
             release_reason = 'Devredildi',
             carried_to_item_id = v_new_item,
             carried_at = NOW(),
             carry_requested_at = NULL,
             updated_at = NOW()
       WHERE hi.id = v_source.id;

      UPDATE public.homework_batches hb
         SET status = 'archived', updated_at = NOW()
       WHERE hb.id = v_source.homework_batch_id
         AND hb.id <> v_batch_id
         AND hb.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM public.homework_items x
           WHERE x.homework_batch_id = hb.id
             AND x.status IN ('pending', 'pending_approval')
         );

      v_carried := v_carried + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'homework_batch_id', v_batch_id,
    'plan_id', v_plan.id,
    'plan_no', v_plan.plan_no,
    'created_plan', v_created_plan,
    'created_batch', v_created_batch,
    'added', v_added,
    'carried', v_carried
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, JSONB, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, JSONB, TIMESTAMPTZ, UUID, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- 5) publish_draft_academic_tasks — görevler plana bağlanır
--
-- 148 gövdesi + plan. Plan verilmediyse ve yayımlanacak taslak varsa YENİ
-- plan açılır (kitapsız plan). Taslak yoksa plan açılmaz (numara harcanmaz).
-- Haftalık akış bağı aynen sürer.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.publish_draft_academic_tasks(UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.publish_draft_academic_tasks(
  p_student_id   UUID,
  p_due_at       TIMESTAMPTZ DEFAULT NULL,
  p_plan_id      UUID DEFAULT NULL,
  p_title_suffix TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_flow      public.weekly_flows%ROWTYPE;
  v_plan      public.homework_plans;
  v_count     INTEGER;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academic_tasks
    WHERE student_id = p_student_id
      AND status = 'draft'
      AND created_by_profile_id IS NOT DISTINCT FROM public.current_profile_id()
  ) THEN
    RETURN jsonb_build_object('published', 0, 'plan_id', p_plan_id);
  END IF;

  SELECT * INTO v_flow FROM public.weekly_flows
  WHERE student_id = p_student_id AND status = 'active'
  LIMIT 1;
  IF v_flow.id IS NULL THEN
    RAISE EXCEPTION 'Açık bir çalışma haftası yok; önce Haftalık Akış''tan haftayı açın';
  END IF;

  IF p_plan_id IS NULL THEN
    v_plan := public._open_homework_plan(p_student_id, p_title_suffix, COALESCE(p_due_at, v_flow.due_at));
  ELSE
    SELECT * INTO v_plan FROM public.homework_plans WHERE id = p_plan_id;
    IF v_plan.id IS NULL OR v_plan.student_id <> p_student_id THEN
      RAISE EXCEPTION 'Ödev planı bulunamadı';
    END IF;
    IF v_plan.status <> 'open' THEN
      RAISE EXCEPTION 'Bu ödev planı kapatılmış; yeni plan yayımlayın';
    END IF;
  END IF;

  UPDATE public.academic_tasks
  SET status = 'open',
      due_at = CASE WHEN undated THEN NULL ELSE COALESCE(due_at, v_plan.due_at, p_due_at, v_flow.due_at) END,
      weekly_flow_id = v_flow.id,
      origin_flow_id = v_flow.id,
      plan_id = v_plan.id,
      published_at = NOW()
  WHERE student_id = p_student_id
    AND status = 'draft'
    AND created_by_profile_id IS NOT DISTINCT FROM public.current_profile_id();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('published', v_count, 'plan_id', v_plan.id, 'plan_no', v_plan.plan_no);
END;
$fn$;

REVOKE ALL ON FUNCTION public.publish_draft_academic_tasks(UUID, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_draft_academic_tasks(UUID, TIMESTAMPTZ, UUID, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- 6) Plan işlemleri: teslim, açıklama, kapanış
-- ------------------------------------------------------------

-- Teslim değişir; İLK teslim (initial_due_at) korunur. Kalemler ve tamamlama
-- kayıtları değişmez. Görevlerden yalnız teslimi planın eski teslimine eşit
-- olanlar taşınır — istisna tarihli görev korunur.
CREATE OR REPLACE FUNCTION public.set_homework_plan_due(
  p_plan_id UUID,
  p_due_at  TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_plan public.homework_plans;
BEGIN
  SELECT * INTO v_plan FROM public.homework_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Ödev planı bulunamadı'; END IF;
  IF NOT public.has_workspace_role(v_plan.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF p_due_at IS NULL THEN RAISE EXCEPTION 'Son teslim gerekli'; END IF;
  IF v_plan.status <> 'open' THEN
    RAISE EXCEPTION 'Kapatılmış planın teslimi değiştirilemez';
  END IF;

  UPDATE public.academic_tasks
     SET due_at = p_due_at
   WHERE plan_id = p_plan_id
     AND status IN ('open', 'draft')
     AND due_at IS NOT DISTINCT FROM v_plan.due_at;

  UPDATE public.homework_batches
     SET due_at = p_due_at,
         due_date = (p_due_at AT TIME ZONE 'Europe/Istanbul')::DATE,
         updated_at = NOW()
   WHERE plan_id = p_plan_id;

  UPDATE public.homework_plans
     SET due_at = p_due_at,
         initial_due_at = COALESCE(initial_due_at, v_plan.due_at, p_due_at),
         updated_at = NOW()
   WHERE id = p_plan_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_homework_plan_due(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_homework_plan_due(UUID, TIMESTAMPTZ) TO authenticated;

-- Açıklama değişir, numara değişmez. Eski başlıklı plana açıklama yazmak
-- onu yeni biçime geçirir ("N. Ödev Planı · açıklama") — öğretmenin açık
-- işlemi; toplu değişiklik değil.
CREATE OR REPLACE FUNCTION public.set_homework_plan_title(
  p_plan_id UUID,
  p_suffix  TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_plan public.homework_plans;
BEGIN
  SELECT * INTO v_plan FROM public.homework_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Ödev planı bulunamadı'; END IF;
  IF NOT public.has_workspace_role(v_plan.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF p_suffix IS NOT NULL AND length(btrim(p_suffix)) > 160 THEN
    RAISE EXCEPTION 'Açıklama en fazla 160 karakter olabilir';
  END IF;

  UPDATE public.homework_plans
     SET title_suffix = NULLIF(btrim(COALESCE(p_suffix, '')), ''),
         legacy_title = NULL,
         updated_at = NOW()
   WHERE id = p_plan_id
  RETURNING * INTO v_plan;

  UPDATE public.homework_batches
     SET title = public._homework_plan_title(v_plan), updated_at = NOW()
   WHERE plan_id = p_plan_id;

  RETURN public._homework_plan_title(v_plan);
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_homework_plan_title(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_homework_plan_title(UUID, TEXT) TO authenticated;

-- Kapanış: sonuç bir kez yazılır. Tekrar çağrı görüntüyü BOZMAZ (077'deki
-- close_weekly_flow ilkesi). Kalemler kapanmaz — öğrenci sonradan
-- tamamlarsa kitap ilerlemesine sayılır, plan sonucu değişmez.
CREATE OR REPLACE FUNCTION public.close_homework_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_plan public.homework_plans;
BEGIN
  SELECT * INTO v_plan FROM public.homework_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Ödev planı bulunamadı'; END IF;
  IF NOT public.has_workspace_role(v_plan.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_plan.status = 'closed' THEN
    RETURN v_plan.closing_result;
  END IF;

  UPDATE public.homework_plans
     SET status = 'closed',
         closed_at = NOW(),
         closed_by_profile_id = public.current_profile_id(),
         closing_result = public._homework_plan_result(p_plan_id),
         updated_at = NOW()
   WHERE id = p_plan_id
  RETURNING * INTO v_plan;

  RETURN v_plan.closing_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.close_homework_plan(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.close_homework_plan(UUID) TO authenticated;


-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.close_homework_plan(UUID);
--   DROP FUNCTION IF EXISTS public.set_homework_plan_title(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.set_homework_plan_due(UUID, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public.publish_draft_academic_tasks(UUID, TIMESTAMPTZ, UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, JSONB, TIMESTAMPTZ, UUID, TEXT);
--   -- 148 publish_draft_academic_tasks ve 155 create_homework_batch tanımlarını yeniden çalıştırın.
--   DROP FUNCTION IF EXISTS public._open_homework_plan(UUID, TEXT, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public._homework_plan_result(UUID);
--   DROP FUNCTION IF EXISTS public._homework_plan_title(public.homework_plans);
--   ALTER TABLE public.academic_tasks DROP COLUMN IF EXISTS plan_id;
--   ALTER TABLE public.homework_batches DROP COLUMN IF EXISTS plan_id;
--   DROP TABLE IF EXISTS public.homework_plans;
-- ============================================================
