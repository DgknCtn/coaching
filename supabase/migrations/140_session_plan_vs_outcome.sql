-- ============================================================
-- 140_session_plan_vs_outcome  (M1.0-02 · Faz 1/3)
--
-- MatMuh M1.0-02 §4-§5 ve §13, P0 7-9:
--   "Plan ve gerçekleşme birbirinden ayrılacak."
--   "'Ertelendi' terminal durum değildir. Tarih/saat değişikliği plan
--    geçmişinde saklanır; oturumun asıl sonucu ayrıca tutulur."
--   "Durum alanlarını tek enum içinde karıştırmayın."
--
-- ============================================================
-- SORUN
-- ============================================================
-- 074/075'te `actual_at` iki anlam taşıyordu: oturum ertelendiyse YENİ
-- PLAN saati, yapıldıysa GERÇEKLEŞME saati. `ertelendi` de bir sonuç
-- gibi saklanıyordu; ertelenen oturum bir daha "Yapıldı" işaretlenemiyor
-- (arayüzde yolu yoktu) ve sonucu hiç kaydedilmiyordu.
--
-- ============================================================
-- ÇÖZÜM
-- ============================================================
--   planned_at          İLK plan (değişmez; takvim slotunun anahtarı)
--   current_planned_at  GÜNCEL plan (taşındıkça değişir)
--   session_plan_history her taşımanın kaydı
--   actual_at           YALNIZ gerçekleşme anı
--   status              planlandi / yapildi / yapilmadi / iptal
--   makeup_status       none / decision_pending / planned /
--                       not_required / completed — TÜRETİLİR
--   unit_count          gerçekleşen ders birimi (0,5 / 1 / 1,5 / 2 / özel)
--   is_extra            ek ders (aylık sabitte ayrıca ücretlenir, 141)
--   source              takvim / elle / telafi
--
-- TELAFİ DURUMU ELLE YÖNETİLMEZ (§12 UI kabul): bir tetikleyici,
-- oturumun ve ona bağlı telafinin durumundan hesaplar:
--   Yapılmadı                          → Telafi kararı bekliyor
--   + bağlı telafi planlandı           → Telafi planlandı
--   + bağlı telafi yapıldı             → Telafi tamamlandı
--   + öğretmen "telafi edilmeyecek"    → Telafi edilmeyecek
--   bağlı telafi yapılmadı/iptal       → yeniden karar bekliyor
--
-- GERİYE UYUM: 075'in RPC imzaları korunur (CREATE OR REPLACE), yalnız
-- davranış değişir; yeni alanları alan sürümler `_v2` adıyla eklenir.
-- Eski istemci bu dosya uygulandıktan sonra da çalışır.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================


-- ============================================================
-- 1) Yeni kolonlar
-- ============================================================
ALTER TABLE public.service_sessions
  ADD COLUMN IF NOT EXISTS current_planned_at TIMESTAMPTZ;

ALTER TABLE public.service_sessions
  ADD COLUMN IF NOT EXISTS unit_count NUMERIC(5,2);

ALTER TABLE public.service_sessions
  ADD COLUMN IF NOT EXISTS is_extra BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.service_sessions
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE public.service_sessions
  ADD COLUMN IF NOT EXISTS makeup_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.service_sessions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'takvim';

ALTER TABLE public.group_sessions
  ADD COLUMN IF NOT EXISTS current_planned_at TIMESTAMPTZ;

ALTER TABLE public.service_sessions
  DROP CONSTRAINT IF EXISTS service_sessions_unit_count_chk;
ALTER TABLE public.service_sessions
  ADD CONSTRAINT service_sessions_unit_count_chk
  CHECK (unit_count IS NULL OR (unit_count > 0 AND unit_count <= 20));

ALTER TABLE public.service_sessions
  DROP CONSTRAINT IF EXISTS service_sessions_cancel_reason_chk;
ALTER TABLE public.service_sessions
  ADD CONSTRAINT service_sessions_cancel_reason_chk
  CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300);

ALTER TABLE public.service_sessions
  DROP CONSTRAINT IF EXISTS service_sessions_makeup_status_chk;
ALTER TABLE public.service_sessions
  ADD CONSTRAINT service_sessions_makeup_status_chk
  CHECK (makeup_status IN ('none', 'decision_pending', 'planned', 'not_required', 'completed'));

ALTER TABLE public.service_sessions
  DROP CONSTRAINT IF EXISTS service_sessions_source_chk;
ALTER TABLE public.service_sessions
  ADD CONSTRAINT service_sessions_source_chk
  CHECK (source IN ('takvim', 'elle', 'telafi'));


-- Eski yazma yolları (generate, create_makeup, doğrudan INSERT)
-- current_planned_at vermez; ilk plan güncel plandır.
CREATE OR REPLACE FUNCTION public.tg_session_default_current_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.current_planned_at IS NULL THEN
    NEW.current_planned_at := NEW.planned_at;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_session_default_current_plan ON public.service_sessions;
CREATE TRIGGER trg_session_default_current_plan
  BEFORE INSERT ON public.service_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_session_default_current_plan();

DROP TRIGGER IF EXISTS trg_group_session_default_current_plan ON public.group_sessions;
CREATE TRIGGER trg_group_session_default_current_plan
  BEFORE INSERT ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_session_default_current_plan();


-- ============================================================
-- 2) Plan geçmişi
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_plan_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id     UUID NOT NULL REFERENCES public.service_sessions(id) ON DELETE CASCADE,
  old_planned_at TIMESTAMPTZ NOT NULL,
  new_planned_at TIMESTAMPTZ NOT NULL,
  note           TEXT CHECK (note IS NULL OR length(note) <= 500),
  changed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_plan_history_session
  ON public.session_plan_history (session_id, changed_at);

ALTER TABLE public.session_plan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_plan_history_read ON public.session_plan_history;
CREATE POLICY session_plan_history_read ON public.session_plan_history
  FOR SELECT
  USING (session_plan_history.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

REVOKE INSERT, UPDATE, DELETE ON public.session_plan_history FROM authenticated;
REVOKE ALL ON public.session_plan_history FROM anon;
GRANT SELECT ON public.session_plan_history TO authenticated;


-- ============================================================
-- 3) Telafi durumunun türetilmesi
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_makeup_status(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row  public.service_sessions%ROWTYPE;
  v_next TEXT;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- PARITY-BEGIN makeup_status
  -- Telafinin kendisi telafi edilmez; başarısız telafi, ASIL oturumu
  -- yeniden "karar bekliyor"a döndürür.
  IF v_row.status <> 'yapilmadi' OR v_row.makeup_of_session_id IS NOT NULL THEN
    v_next := 'none';
  ELSIF EXISTS (
    SELECT 1 FROM public.service_sessions c
    WHERE c.makeup_of_session_id = v_row.id AND c.status = 'yapildi'
  ) THEN
    v_next := 'completed';
  ELSIF EXISTS (
    SELECT 1 FROM public.service_sessions c
    WHERE c.makeup_of_session_id = v_row.id AND c.status = 'planlandi'
  ) THEN
    v_next := 'planned';
  ELSIF v_row.makeup_decision = 'waived' THEN
    v_next := 'not_required';
  ELSE
    v_next := 'decision_pending';
  END IF;
  -- PARITY-END makeup_status

  IF v_next IS DISTINCT FROM v_row.makeup_status THEN
    UPDATE public.service_sessions
    SET makeup_status = v_next
    WHERE id = p_session_id;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.refresh_makeup_status(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_refresh_makeup_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_makeup_status(OLD.makeup_of_session_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_makeup_status(NEW.id);
  PERFORM public.refresh_makeup_status(NEW.makeup_of_session_id);
  IF TG_OP = 'UPDATE' AND OLD.makeup_of_session_id IS DISTINCT FROM NEW.makeup_of_session_id THEN
    PERFORM public.refresh_makeup_status(OLD.makeup_of_session_id);
  END IF;
  RETURN NEW;
END;
$fn$;

-- makeup_status bu listede YOK: tetikleyicinin kendi yazdığı kolon onu
-- yeniden tetiklememeli.
DROP TRIGGER IF EXISTS trg_refresh_makeup_status ON public.service_sessions;
CREATE TRIGGER trg_refresh_makeup_status
  AFTER INSERT OR DELETE OR
  UPDATE OF status, makeup_decision, makeup_of_session_id
  ON public.service_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_makeup_status();


-- ============================================================
-- 4) Mevcut kayıtların taşınması (tek seferlik, idempotent)
-- ============================================================
UPDATE public.service_sessions
SET current_planned_at = planned_at
WHERE current_planned_at IS NULL
  AND status <> 'ertelendi';

UPDATE public.group_sessions
SET current_planned_at = planned_at
WHERE current_planned_at IS NULL
  AND status <> 'ertelendi';

-- Ertelenmiş oturum: yeni saat plan geçmişine yazılır, oturum yeniden
-- "Planlandı" olur — sonucu henüz kaydedilmemiştir.
INSERT INTO public.session_plan_history (workspace_id, session_id, old_planned_at, new_planned_at, note, changed_at)
SELECT ss.workspace_id, ss.id, ss.planned_at, ss.actual_at, 'Önceki "Ertelendi" kaydından taşındı.', ss.updated_at
FROM public.service_sessions ss
WHERE ss.status = 'ertelendi'
  AND ss.actual_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.session_plan_history h WHERE h.session_id = ss.id
  );

UPDATE public.service_sessions
SET current_planned_at = COALESCE(actual_at, planned_at),
    actual_at          = NULL,
    status             = 'planlandi'
WHERE status = 'ertelendi';

UPDATE public.group_sessions
SET current_planned_at = COALESCE(actual_at, planned_at),
    actual_at          = NULL,
    status             = 'planlandi'
WHERE status = 'ertelendi';

UPDATE public.service_sessions
SET source = 'telafi'
WHERE makeup_of_session_id IS NOT NULL
  AND source <> 'telafi';

-- Gerçekleşmiş oturumun birimi: hizmetin varsayılanı. Tetikleyici bu
-- kolonu henüz izlemediği için (141 ekler) geçmiş tahakkuklar DEĞİŞMEZ.
UPDATE public.service_sessions ss
SET unit_count = sv.default_unit_count
FROM public.student_services sv
WHERE sv.id = ss.service_id
  AND ss.status = 'yapildi'
  AND ss.unit_count IS NULL;

DO $backfill$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.service_sessions WHERE status = 'yapilmadi' LOOP
    PERFORM public.refresh_makeup_status(r.id);
  END LOOP;
END;
$backfill$;

ALTER TABLE public.service_sessions
  ALTER COLUMN current_planned_at SET NOT NULL;

ALTER TABLE public.group_sessions
  ALTER COLUMN current_planned_at SET NOT NULL;

-- 'ertelendi' artık bir durum değil.
ALTER TABLE public.service_sessions
  DROP CONSTRAINT IF EXISTS service_sessions_status_check;
ALTER TABLE public.service_sessions
  DROP CONSTRAINT IF EXISTS service_sessions_status_chk;
ALTER TABLE public.service_sessions
  ADD CONSTRAINT service_sessions_status_chk
  CHECK (status IN ('planlandi', 'yapildi', 'yapilmadi', 'iptal'));

ALTER TABLE public.group_sessions
  DROP CONSTRAINT IF EXISTS group_sessions_status_check;
ALTER TABLE public.group_sessions
  DROP CONSTRAINT IF EXISTS group_sessions_status_chk;
ALTER TABLE public.group_sessions
  ADD CONSTRAINT group_sessions_status_chk
  CHECK (status IN ('planlandi', 'yapildi', 'yapilmadi', 'iptal'));

-- Haftalık ekran ve "sıradaki temas" güncel plana göre tarar.
CREATE INDEX IF NOT EXISTS idx_service_sessions_workspace_current
  ON public.service_sessions (workspace_id, current_planned_at);

CREATE INDEX IF NOT EXISTS idx_service_sessions_student_current
  ON public.service_sessions (student_id, current_planned_at);


-- ============================================================
-- 5) Oturum üretimi — ritme göre
--
-- haftada_1 : bir slot (weekday/start_time)
-- haftada_2 : iki slot (+ weekday_2/start_time_2)
-- esnek     : ÜRETİLMEZ; oturum elle eklenir
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_service_sessions(
  p_student_id UUID,
  p_year       INTEGER,
  p_month      INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_created      INTEGER := 0;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Geçersiz ay';
  END IF;

  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Geçersiz yıl';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_slotlar (
    service_id   UUID,
    workspace_id UUID,
    student_id   UUID,
    group_id     UUID,
    duration     SMALLINT,
    planned_at   TIMESTAMPTZ
  ) ON COMMIT DROP;

  -- 087: safeupdate geçici tabloda da WHERE ister.
  DELETE FROM tmp_slotlar WHERE true;

  INSERT INTO tmp_slotlar
  SELECT
    s.id,
    s.workspace_id,
    s.student_id,
    s.group_id,
    s.planned_duration_minutes,
    ((g.gun + slot.saat) AT TIME ZONE 'Europe/Istanbul')
  FROM public.student_services s
  CROSS JOIN LATERAL (
    VALUES (s.weekday, s.start_time),
           (s.weekday_2, s.start_time_2)
  ) AS slot(gun_no, saat)
  JOIN (
    SELECT d::DATE AS gun
    FROM generate_series(
      make_date(p_year, p_month, 1),
      (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::DATE,
      INTERVAL '1 day'
    ) AS d
  ) g ON EXTRACT(ISODOW FROM g.gun) = slot.gun_no
  WHERE s.student_id = p_student_id
    AND s.status = 'active'
    AND s.cadence <> 'esnek'
    AND slot.gun_no IS NOT NULL
    AND slot.saat IS NOT NULL
    AND g.gun >= s.start_date;

  INSERT INTO public.group_sessions (
    workspace_id, group_id, planned_at, current_planned_at, duration_minutes, status
  )
  SELECT DISTINCT workspace_id, group_id, planned_at, planned_at, duration, 'planlandi'
  FROM tmp_slotlar
  WHERE group_id IS NOT NULL
  ON CONFLICT (group_id, planned_at) DO NOTHING;

  WITH eklenen AS (
    INSERT INTO public.service_sessions (
      workspace_id, student_id, service_id, planned_at, current_planned_at,
      duration_minutes, status, group_session_id, source
    )
    SELECT
      t.workspace_id, t.student_id, t.service_id, t.planned_at,
      COALESCE(gs.current_planned_at, t.planned_at),
      t.duration, 'planlandi', gs.id, 'takvim'
    FROM tmp_slotlar t
    LEFT JOIN public.group_sessions gs
      ON gs.group_id = t.group_id AND gs.planned_at = t.planned_at
    ON CONFLICT (service_id, planned_at) WHERE makeup_of_session_id IS NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_created FROM eklenen;

  UPDATE public.service_sessions ss
  SET group_session_id = gs.id
  FROM tmp_slotlar t
  JOIN public.group_sessions gs
    ON gs.group_id = t.group_id AND gs.planned_at = t.planned_at
  WHERE ss.service_id = t.service_id
    AND ss.planned_at = t.planned_at
    AND ss.makeup_of_session_id IS NULL
    AND ss.group_session_id IS NULL;

  RETURN v_created;
END;
$fn$;

REVOKE ALL ON FUNCTION public.generate_service_sessions(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_service_sessions(UUID, INTEGER, INTEGER) TO authenticated;


-- Koç geneli haftalık ekran (M1.0-02 §4) her öğrenci için ayrı RPC
-- çağırmasın: aktif hizmeti olan bütün öğrenciler TEK çağrıda. Yük
-- testi bulgusu (40 eşzamanlı) gidiş-dönüş sayısının asıl maliyet
-- olduğunu gösterdi.
CREATE OR REPLACE FUNCTION public.generate_workspace_sessions(
  p_workspace_id UUID,
  p_year         INTEGER,
  p_month        INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total INTEGER := 0;
  r       RECORD;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  FOR r IN
    SELECT DISTINCT sv.student_id
    FROM public.student_services sv
    JOIN public.students s ON s.id = sv.student_id
    WHERE sv.workspace_id = p_workspace_id
      AND sv.status = 'active'
      AND sv.cadence <> 'esnek'
      AND s.status = 'active'
  LOOP
    v_total := v_total + public.generate_service_sessions(r.student_id, p_year, p_month);
  END LOOP;

  RETURN v_total;
END;
$fn$;

REVOKE ALL ON FUNCTION public.generate_workspace_sessions(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_workspace_sessions(UUID, INTEGER, INTEGER) TO authenticated;


-- ============================================================
-- 6) Sonuç kaydı
-- ============================================================

-- Yeni sürüm: birim, iptal nedeni. 'yapildi' gelecekteki bir oturum için
-- de kabul edilir — ders gerçekten önce yapıldıysa (§4 Yapıldı paneli).
CREATE OR REPLACE FUNCTION public.set_session_outcome_v2(
  p_session_id       UUID,
  p_status           TEXT,
  p_actual_at        TIMESTAMPTZ DEFAULT NULL,
  p_duration_minutes SMALLINT    DEFAULT NULL,
  p_unit_count       NUMERIC     DEFAULT NULL,
  p_note             TEXT        DEFAULT NULL,
  p_cancel_reason    TEXT        DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_session public.service_sessions%ROWTYPE;
  v_default NUMERIC;
BEGIN
  SELECT * INTO v_session FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görüşme kaydı bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_session.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_status NOT IN ('planlandi', 'yapildi', 'iptal', 'yapilmadi') THEN
    RAISE EXCEPTION 'Geçersiz görüşme durumu: %', p_status;
  END IF;

  IF p_unit_count IS NOT NULL AND (p_unit_count <= 0 OR p_unit_count > 20) THEN
    RAISE EXCEPTION 'Ders birimi 0 ile 20 arasında olmalı';
  END IF;

  IF p_status = 'yapilmadi' AND v_session.status <> 'yapilmadi' AND EXISTS (
    SELECT 1 FROM public.service_sessions c
    WHERE c.makeup_of_session_id = p_session_id AND c.status IN ('planlandi', 'yapildi')
  ) THEN
    RAISE EXCEPTION 'Bu oturumun bağlı telafisi var';
  END IF;

  SELECT default_unit_count INTO v_default
  FROM public.student_services WHERE id = v_session.service_id;

  UPDATE public.service_sessions
  SET status    = p_status,
      actual_at = CASE
                    WHEN p_status = 'yapildi'
                      THEN COALESCE(p_actual_at, actual_at, current_planned_at)
                    ELSE NULL
                  END,
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      unit_count = CASE
                     WHEN p_status = 'yapildi'
                       THEN COALESCE(p_unit_count, unit_count, v_default, 1)
                     ELSE unit_count
                   END,
      cancel_reason = CASE
                        WHEN p_status = 'iptal'
                          THEN NULLIF(TRIM(COALESCE(p_cancel_reason, '')), '')
                        ELSE NULL
                      END,
      -- "Yapılmadı"dan çıkan oturumun eski telafi kararı geçersizdir.
      makeup_decision = CASE WHEN p_status = 'yapilmadi' THEN makeup_decision ELSE NULL END,
      note      = COALESCE(NULLIF(TRIM(COALESCE(p_note, '')), ''), note)
  WHERE id = p_session_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_session_outcome_v2(UUID, TEXT, TIMESTAMPTZ, SMALLINT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_session_outcome_v2(UUID, TEXT, TIMESTAMPTZ, SMALLINT, NUMERIC, TEXT, TEXT) TO authenticated;


-- 075 imzası korunur; yeni sürüme yönlendirir.
CREATE OR REPLACE FUNCTION public.set_session_outcome(
  p_session_id UUID,
  p_status     TEXT,
  p_actual_at  TIMESTAMPTZ DEFAULT NULL,
  p_duration_minutes SMALLINT DEFAULT NULL,
  p_attended   BOOLEAN DEFAULT NULL,
  p_note       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.set_session_outcome_v2(
    p_session_id, p_status, p_actual_at, p_duration_minutes, NULL, p_note, NULL
  );
  IF p_attended IS NOT NULL THEN
    UPDATE public.service_sessions SET attended = p_attended WHERE id = p_session_id;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_session_outcome(UUID, TEXT, TIMESTAMPTZ, SMALLINT, BOOLEAN, TEXT) TO authenticated;


-- Planı değiştir: yalnız güncel plan + geçmiş satırı. Durum değişmez.
CREATE OR REPLACE FUNCTION public.reschedule_session(
  p_session_id UUID,
  p_new_at     TIMESTAMPTZ,
  p_note       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_session public.service_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görüşme kaydı bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_session.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_new_at IS NULL THEN
    RAISE EXCEPTION 'Yeni tarih ve saat gerekli';
  END IF;

  IF v_session.status <> 'planlandi' THEN
    RAISE EXCEPTION 'Yalnız henüz sonuçlanmamış bir oturumun planı değiştirilebilir';
  END IF;

  IF p_new_at = v_session.current_planned_at THEN
    RETURN;
  END IF;

  INSERT INTO public.session_plan_history (
    workspace_id, session_id, old_planned_at, new_planned_at, note, changed_by_profile_id
  )
  VALUES (
    v_session.workspace_id, p_session_id, v_session.current_planned_at, p_new_at,
    NULLIF(TRIM(COALESCE(p_note, '')), ''), public.current_profile_id()
  );

  UPDATE public.service_sessions
  SET current_planned_at = p_new_at,
      note      = COALESCE(NULLIF(TRIM(COALESCE(p_note, '')), ''), note)
  WHERE id = p_session_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.reschedule_session(UUID, TIMESTAMPTZ, TEXT) TO authenticated;


-- Telafi: orijinal kayda bağlı yeni oturum. Hizmeti (ve dolayısıyla
-- finans ilişkisini) MİRAS ALIR; 141'in tahakkuku tek kayıt garanti eder.
CREATE OR REPLACE FUNCTION public.create_makeup_session(
  p_session_id UUID,
  p_planned_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_origin public.service_sessions%ROWTYPE;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_origin FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görüşme kaydı bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_origin.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_origin.status <> 'yapilmadi' THEN
    RAISE EXCEPTION 'Telafi yalnız "Yapılmadı" işaretli bir görüşme için oluşturulur';
  END IF;

  IF v_origin.makeup_of_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu kayıt zaten bir telafi; telafinin telafisi oluşturulamaz';
  END IF;

  IF p_planned_at IS NULL THEN
    RAISE EXCEPTION 'Telafi tarihi gerekli';
  END IF;

  -- Aynı oturum iki kez telafi edilmez.
  IF EXISTS (
    SELECT 1 FROM public.service_sessions c
    WHERE c.makeup_of_session_id = p_session_id AND c.status IN ('planlandi', 'yapildi')
  ) THEN
    RAISE EXCEPTION 'Bu oturum için zaten bir telafi var';
  END IF;

  -- Telafi kararı verilmiş sayılır.
  UPDATE public.service_sessions
  SET makeup_decision = 'pending'
  WHERE id = p_session_id;

  INSERT INTO public.service_sessions (
    workspace_id, student_id, service_id, planned_at, current_planned_at, duration_minutes,
    status, makeup_of_session_id, source, created_by_profile_id
  )
  VALUES (
    v_origin.workspace_id, v_origin.student_id, v_origin.service_id, p_planned_at, p_planned_at,
    v_origin.duration_minutes, 'planlandi', v_origin.id, 'telafi', public.current_profile_id()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_makeup_session(UUID, TIMESTAMPTZ) TO authenticated;


-- Esnek ritim ve ek ders: takvim dışında elle eklenen oturum.
CREATE OR REPLACE FUNCTION public.create_adhoc_session(
  p_service_id       UUID,
  p_planned_at       TIMESTAMPTZ,
  p_is_extra         BOOLEAN DEFAULT FALSE,
  p_duration_minutes SMALLINT DEFAULT NULL,
  p_note             TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_service public.student_services%ROWTYPE;
  v_new_id  UUID;
BEGIN
  SELECT * INTO v_service FROM public.student_services WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hizmet bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_service.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_service.participation = 'grup' THEN
    RAISE EXCEPTION 'Grup dersine elle oturum eklenmez.';
  END IF;

  IF p_planned_at IS NULL THEN
    RAISE EXCEPTION 'Tarih ve saat gerekli.';
  END IF;

  IF p_duration_minutes IS NOT NULL AND (p_duration_minutes < 5 OR p_duration_minutes > 600) THEN
    RAISE EXCEPTION 'Süre 5 ile 600 dakika arasında olmalı.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_sessions
    WHERE service_id = p_service_id
      AND planned_at = p_planned_at
      AND makeup_of_session_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Bu hizmet için aynı tarih ve saatte bir oturum zaten var.';
  END IF;

  INSERT INTO public.service_sessions (
    workspace_id, student_id, service_id, planned_at, current_planned_at, duration_minutes,
    status, is_extra, source, note, created_by_profile_id
  )
  VALUES (
    v_service.workspace_id, v_service.student_id, p_service_id, p_planned_at, p_planned_at,
    COALESCE(p_duration_minutes, v_service.planned_duration_minutes),
    'planlandi', COALESCE(p_is_extra, FALSE), 'elle',
    NULLIF(TRIM(COALESCE(p_note, '')), ''), public.current_profile_id()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_adhoc_session(UUID, TIMESTAMPTZ, BOOLEAN, SMALLINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_adhoc_session(UUID, TIMESTAMPTZ, BOOLEAN, SMALLINT, TEXT) TO authenticated;


-- Elle eklenmiş, henüz sonuçlanmamış bir oturumu geri almak (yanlış
-- tarih). Takvim oturumu silinmez — o "İptal edildi" ile kapanır.
CREATE OR REPLACE FUNCTION public.delete_adhoc_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row public.service_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görüşme kaydı bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_row.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;
  IF v_row.source = 'takvim' OR v_row.status <> 'planlandi' THEN
    RAISE EXCEPTION 'Yalnız elle eklenmiş ve henüz sonuçlanmamış oturum silinebilir';
  END IF;
  DELETE FROM public.service_sessions WHERE id = p_session_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_adhoc_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_adhoc_session(UUID) TO authenticated;


-- Grup sonucu: 'ertelendi' çıktı; gerçekleşme anı yalnız 'yapildi'de.
CREATE OR REPLACE FUNCTION public.set_group_session_outcome(
  p_group_session_id UUID,
  p_status           TEXT,
  p_actual_at        TIMESTAMPTZ DEFAULT NULL,
  p_duration_minutes SMALLINT    DEFAULT NULL,
  p_note             TEXT        DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_group  public.group_sessions%ROWTYPE;
  v_count  INTEGER := 0;
BEGIN
  SELECT * INTO v_group FROM public.group_sessions WHERE id = p_group_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grup oturumu bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_group.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_status NOT IN ('planlandi', 'yapildi', 'iptal', 'yapilmadi') THEN
    RAISE EXCEPTION 'Geçersiz görüşme durumu.';
  END IF;

  UPDATE public.group_sessions
  SET status           = p_status,
      actual_at        = CASE WHEN p_status = 'yapildi'
                              THEN COALESCE(p_actual_at, actual_at, current_planned_at)
                              ELSE NULL END,
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      note             = COALESCE(p_note, note),
      updated_at       = NOW()
  WHERE id = p_group_session_id;

  -- 083 ile aynı fan-out: yalnız aktif hizmet, "katılmadı" ezilmez.
  WITH guncellenen AS (
    UPDATE public.service_sessions ss
    SET status           = p_status,
        actual_at        = CASE WHEN p_status = 'yapildi'
                                THEN COALESCE(p_actual_at, ss.actual_at, ss.current_planned_at)
                                ELSE NULL END,
        duration_minutes = COALESCE(p_duration_minutes, ss.duration_minutes),
        unit_count       = CASE WHEN p_status = 'yapildi'
                                THEN COALESCE(ss.unit_count, sv.default_unit_count, 1)
                                ELSE ss.unit_count END,
        note             = COALESCE(p_note, ss.note),
        updated_at       = NOW()
    FROM public.student_services sv
    WHERE ss.group_session_id = p_group_session_id
      AND sv.id = ss.service_id
      AND sv.status = 'active'
      AND ss.attended IS DISTINCT FROM FALSE
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM guncellenen;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_group_session_outcome(UUID, TEXT, TIMESTAMPTZ, SMALLINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_session_outcome(UUID, TEXT, TIMESTAMPTZ, SMALLINT, TEXT) TO authenticated;


-- ============================================================
-- 7) Hizmet düzenleme — elle taşınan/eklenen oturum korunur
-- ============================================================

-- 084 imzası korunur; kesime "taşınmamış takvim oturumu" şartı eklenir.
CREATE OR REPLACE FUNCTION public.update_student_service(
  p_service_id        UUID,
  p_weekday           SMALLINT,
  p_start_time        TIME,
  p_duration_minutes  SMALLINT,
  p_effective_from    DATE,
  p_medium            TEXT DEFAULT NULL,
  p_finance_link      TEXT DEFAULT NULL,
  p_submission_offset SMALLINT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_service public.student_services%ROWTYPE;
BEGIN
  SELECT * INTO v_service FROM public.student_services WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hizmet bulunamadı.';
  END IF;

  RETURN public.update_student_service_v2(
    p_service_id,
    CASE WHEN v_service.cadence = 'haftada_2' THEN 'haftada_1' ELSE v_service.cadence END,
    p_weekday, p_start_time, NULL, NULL,
    p_duration_minutes, p_effective_from, p_medium, p_finance_link,
    NULL, p_submission_offset
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_student_service(UUID, SMALLINT, TIME, SMALLINT, DATE, TEXT, TEXT, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_student_service(UUID, SMALLINT, TIME, SMALLINT, DATE, TEXT, TEXT, SMALLINT) TO authenticated;


-- Ritim, ikinci slot ve varsayılan birim de "şu tarihten itibaren"
-- değişir.
CREATE OR REPLACE FUNCTION public.update_student_service_v2(
  p_service_id        UUID,
  p_cadence           TEXT,
  p_weekday           SMALLINT,
  p_start_time        TIME,
  p_weekday_2         SMALLINT,
  p_start_time_2      TIME,
  p_duration_minutes  SMALLINT,
  p_effective_from    DATE,
  p_medium            TEXT,
  p_finance_link      TEXT,
  p_default_unit      NUMERIC,
  p_submission_offset INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_service public.student_services%ROWTYPE;
  v_cutoff  TIMESTAMPTZ;
  v_removed INTEGER := 0;
BEGIN
  SELECT * INTO v_service FROM public.student_services WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hizmet bulunamadı.';
  END IF;
  IF NOT public.has_workspace_role(v_service.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;
  IF p_cadence NOT IN ('haftada_1', 'haftada_2', 'esnek') THEN
    RAISE EXCEPTION 'Geçersiz ritim.';
  END IF;
  IF v_service.participation = 'grup' AND p_cadence = 'esnek' THEN
    RAISE EXCEPTION 'Grup dersi esnek ritimle tanımlanamaz.';
  END IF;
  IF p_weekday IS NULL OR p_weekday < 1 OR p_weekday > 7 THEN
    RAISE EXCEPTION 'Geçerli bir gün seçin.';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes < 5 OR p_duration_minutes > 600 THEN
    RAISE EXCEPTION 'Süre 5 ile 600 dakika arasında olmalı.';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Değişikliğin başlayacağı tarihi seçin.';
  END IF;
  IF p_medium IS NOT NULL AND p_medium NOT IN ('online', 'yuz_yuze') THEN
    RAISE EXCEPTION 'Geçersiz ortam.';
  END IF;
  IF p_finance_link IS NOT NULL
     AND p_finance_link NOT IN ('aylik_paket', 'ders_basi', 'haric') THEN
    RAISE EXCEPTION 'Geçersiz finans ilişkisi.';
  END IF;
  IF p_default_unit IS NOT NULL AND (p_default_unit <= 0 OR p_default_unit > 20) THEN
    RAISE EXCEPTION 'Varsayılan birim 0 ile 20 arasında olmalı.';
  END IF;

  UPDATE public.student_services
  SET cadence                   = p_cadence,
      weekday                   = p_weekday,
      start_time                = p_start_time,
      weekday_2                 = CASE WHEN p_cadence = 'haftada_2' THEN p_weekday_2 END,
      start_time_2              = CASE WHEN p_cadence = 'haftada_2' THEN p_start_time_2 END,
      planned_duration_minutes  = p_duration_minutes,
      start_date                = p_effective_from,
      medium                    = COALESCE(p_medium, medium),
      finance_link              = COALESCE(p_finance_link, finance_link),
      default_unit_count        = COALESCE(p_default_unit, default_unit_count),
      submission_offset_minutes = COALESCE(p_submission_offset, submission_offset_minutes),
      updated_at                = NOW()
  WHERE id = p_service_id;

  v_cutoff := GREATEST(
    (p_effective_from::TIMESTAMP AT TIME ZONE 'Europe/Istanbul'),
    NOW()
  );

  -- 084 ile aynı kesim; ek olarak ELLE taşınmış ya da elle eklenmiş
  -- oturumlar korunur. Öğretmenin tek seferlik kararı, varsayılan desen
  -- değişti diye kaybolmamalı.
  WITH silinen AS (
    DELETE FROM public.service_sessions
    WHERE service_id = p_service_id
      AND status = 'planlandi'
      AND makeup_of_session_id IS NULL
      AND source = 'takvim'
      AND current_planned_at = planned_at
      AND planned_at >= v_cutoff
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_removed FROM silinen;

  RETURN v_removed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_student_service_v2(UUID, TEXT, SMALLINT, TIME, SMALLINT, TIME, SMALLINT, DATE, TEXT, TEXT, NUMERIC, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_student_service_v2(UUID, TEXT, SMALLINT, TIME, SMALLINT, TIME, SMALLINT, DATE, TEXT, TEXT, NUMERIC, INTEGER) TO authenticated;


-- ============================================================
-- 8) Okuma view'ları — güncel plana göre
--
-- Sütun listesi korunur (CREATE OR REPLACE); yeni sütunlar sona eklenir.
-- Böylece bu view'lara bağlı teacher_student_operation_view düşmez.
-- ============================================================
CREATE OR REPLACE VIEW public.student_next_contact_view
WITH (security_invoker = true) AS
SELECT DISTINCT ON (ss.workspace_id, ss.student_id)
  ss.workspace_id,
  ss.student_id,
  ss.current_planned_at                           AS next_contact_at,
  sv.kind                                         AS next_contact_kind,
  sv.participation                                AS next_contact_participation,
  ss.current_planned_at
    - (COALESCE(sv.submission_offset_minutes, 0) * INTERVAL '1 minute')
                                                  AS submission_cutoff_at
FROM public.service_sessions ss
JOIN public.student_services sv ON sv.id = ss.service_id
WHERE ss.status = 'planlandi'
  AND ss.current_planned_at >= NOW()
ORDER BY
  ss.workspace_id,
  ss.student_id,
  ss.current_planned_at ASC;

CREATE OR REPLACE VIEW public.student_service_session_view
WITH (security_invoker = true) AS
SELECT
  ss.id,
  ss.workspace_id,
  ss.student_id,
  ss.service_id,
  ss.group_session_id,
  ss.planned_at,
  ss.actual_at,
  ss.duration_minutes,
  ss.status,
  ss.attended,
  ss.note,
  ss.makeup_of_session_id,
  ss.makeup_decision,
  asil.planned_at AS origin_planned_at,
  -- PARITY-BEGIN attributed_month
  date_trunc(
    'month',
    COALESCE(asil.planned_at, ss.planned_at) AT TIME ZONE 'Europe/Istanbul'
  )::DATE AS attributed_month,
  -- PARITY-END attributed_month
  ss.current_planned_at,
  ss.unit_count,
  ss.is_extra,
  ss.makeup_status,
  ss.cancel_reason,
  ss.source
FROM public.service_sessions ss
LEFT JOIN public.service_sessions asil
  ON asil.id = ss.makeup_of_session_id;

REVOKE ALL ON public.student_service_session_view FROM anon;
GRANT SELECT ON public.student_service_session_view TO authenticated;

CREATE OR REPLACE VIEW public.student_service_month_view AS
WITH atanmis AS (
  SELECT
    ss.id,
    ss.workspace_id,
    ss.student_id,
    ss.service_id,
    ss.status,
    ss.attended,
    ss.duration_minutes,
    ss.is_extra,
    ss.makeup_status,
    date_trunc(
      'month',
      COALESCE(asil.planned_at, ss.planned_at) AT TIME ZONE 'Europe/Istanbul'
    )::DATE AS ay
  FROM public.service_sessions ss
  LEFT JOIN public.service_sessions asil
    ON asil.id = ss.makeup_of_session_id
)
SELECT
  a.workspace_id,
  a.student_id,
  a.service_id,
  sv.kind,
  sv.participation,
  sv.medium,
  a.ay,
  COUNT(*) FILTER (WHERE a.status <> 'iptal')                        AS planlanan,
  COUNT(*) FILTER (WHERE a.status = 'yapildi'
                     AND COALESCE(a.attended, TRUE))                 AS yapilan,
  COUNT(*) FILTER (WHERE a.status = 'planlandi')                     AS bekleyen,
  COUNT(*) FILTER (WHERE a.status = 'yapilmadi')                     AS yapilmayan,
  COUNT(*) FILTER (WHERE a.status = 'iptal')                         AS iptal,
  COALESCE(SUM(a.duration_minutes) FILTER (WHERE a.status = 'yapildi'
                     AND COALESCE(a.attended, TRUE)), 0)             AS yapilan_dakika,
  COUNT(*) FILTER (WHERE a.is_extra AND a.status = 'yapildi')        AS ek_ders,
  COUNT(*) FILTER (WHERE a.makeup_status = 'decision_pending')       AS telafi_bekleyen
FROM atanmis a
JOIN public.student_services sv ON sv.id = a.service_id
GROUP BY a.workspace_id, a.student_id, a.service_id,
         sv.kind, sv.participation, sv.medium, a.ay;

ALTER VIEW public.student_service_month_view SET (security_invoker = on);
GRANT SELECT ON public.student_service_month_view TO authenticated;

-- ============================================================
-- ROLLBACK (yalnız kolon/fonksiyon; 'ertelendi' verisi geri gelmez —
-- plan geçmişi onun kaydıdır)
--
--   DROP FUNCTION IF EXISTS public.generate_workspace_sessions(UUID, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public.delete_adhoc_session(UUID);
--   DROP FUNCTION IF EXISTS public.create_adhoc_session(UUID, TIMESTAMPTZ, BOOLEAN, SMALLINT, TEXT);
--   DROP FUNCTION IF EXISTS public.set_session_outcome_v2(UUID, TEXT, TIMESTAMPTZ, SMALLINT, NUMERIC, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.update_student_service_v2(UUID, TEXT, SMALLINT, TIME, SMALLINT, TIME, SMALLINT, DATE, TEXT, TEXT, NUMERIC, INTEGER);
--   DROP TRIGGER IF EXISTS trg_refresh_makeup_status ON public.service_sessions;
--   DROP FUNCTION IF EXISTS public.tg_refresh_makeup_status();
--   DROP FUNCTION IF EXISTS public.refresh_makeup_status(UUID);
--   DROP TABLE IF EXISTS public.session_plan_history;
-- ============================================================
