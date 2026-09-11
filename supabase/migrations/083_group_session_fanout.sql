-- ============================================================
-- 083_group_session_fanout
--
-- R7 / Site Testi 04 Rev.3 · §9 ve kabul maddesi:
--   "Grup oturumu tek işlemle aktif grup öğrencilerine yansıyor."
--   "Grup oturumu bir kez 'Yapıldı' işaretlenir; gruptaki aktif
--    öğrencilerin hizmet geçmişine otomatik yansır. Öğrenci bazında
--    'Katılmadı' istisnası tutulabilir."
--
-- ============================================================
-- SORUN: TABLO VARDI, HİÇBİR ŞEY YAZMIYORDU
-- ============================================================
-- 074 `group_sessions` tablosunu ve `service_sessions.group_session_id`
-- sütununu açmış. Ama:
--
--   * `generate_service_sessions` (075) grup oturumu ÜRETMİYOR —
--     öğrenci başına satır açıyor, `group_session_id` NULL kalıyor.
--   * Grup oturumunu tek noktadan işaretleyip gruba yansıtan bir RPC
--     hiç yazılmamış.
--
-- Sonuç: on kişilik bir grup dersini "Yapıldı" işaretlemek için
-- öğretmenin on ayrı öğrenci ekranını açması gerekiyordu. Belgenin
-- "tek işlemle" şartı karşılanmıyordu ve bir öğrenci unutulduğunda
-- aylık sayacı sessizce eksik kalıyordu.
--
-- ============================================================
-- "KATILMADI" NEDEN AYRI BİR ALAN
-- ============================================================
-- Grup dersi YAPILDI ama bir öğrenci gelmedi — bu, dersin
-- yapılmadığı anlamına gelmez. `attended = FALSE` istisnası öğrenci
-- bazında tutulur ve 075'teki aylık sayaç zaten onu hesaba katıyor
-- (`COUNT(*) FILTER (WHERE status = 'yapildi' AND COALESCE(attended, TRUE))`).
--
-- Fan-out bu istisnayı EZMEZ: öğretmen önce "Ali katılmadı" deyip
-- sonra grubu "Yapıldı" işaretlerse Ali'nin istisnası korunur. Aksi
-- hâlde işlem sırası veriyi belirlerdi.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================

-- ============================================================
-- 1) create_student_group — grup oluşturma
-- ============================================================
--
-- Grup şimdiye kadar yalnız SEÇİLEBİLİYORDU; oluşturmanın arayüzde
-- hiçbir yolu yoktu. Grup hizmeti tanımlamak isteyen öğretmen boş bir
-- açılır listeye bakıyordu.

CREATE OR REPLACE FUNCTION public.create_student_group(
  p_workspace_id UUID,
  p_name         TEXT,
  p_subject      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Grup adı gerekli.';
  END IF;

  INSERT INTO public.student_groups (workspace_id, name, subject, status)
  VALUES (p_workspace_id, btrim(p_name), NULLIF(btrim(COALESCE(p_subject, '')), ''), 'active')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_student_group(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_student_group(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 2) generate_service_sessions — grup oturumunu da üret ve BAĞLA
-- ============================================================
--
-- 075'in gövdesi korunuyor; eklenen tek şey grup hizmetleri için
-- ortak `group_sessions` satırının açılması ve öğrenci satırlarının ona
-- bağlanması.
--
-- SIRA ÖNEMLİ: önce grup oturumu, sonra öğrenci oturumu. Tersi olsaydı
-- bağlanacak satır henüz yokken öğrenci kaydı NULL ile açılırdı.
--
-- İDEMPOTENT: iki ON CONFLICT DO NOTHING. Aynı ay iki kez çağrıldığında
-- ne grup satırı ne öğrenci satırı çoğalır; farklı öğrenciler için
-- çağrıldığında ikincisi var olan grup satırına bağlanır.

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

  -- Ayın gerçek takviminden slotlar. İki ifadede de aynı tanım
  -- kullanılıyor; ayrışırlarsa grup satırı ile öğrenci satırı farklı
  -- anlara düşer ve bağ hiç kurulmaz.
  CREATE TEMP TABLE IF NOT EXISTS tmp_slotlar (
    service_id   UUID,
    workspace_id UUID,
    student_id   UUID,
    group_id     UUID,
    duration     SMALLINT,
    planned_at   TIMESTAMPTZ
  ) ON COMMIT DROP;

  DELETE FROM tmp_slotlar;

  INSERT INTO tmp_slotlar
  SELECT
    s.id,
    s.workspace_id,
    s.student_id,
    s.group_id,
    s.planned_duration_minutes,
    ((g.gun + s.start_time) AT TIME ZONE 'Europe/Istanbul')
  FROM public.student_services s
  JOIN (
    SELECT d::DATE AS gun
    FROM generate_series(
      make_date(p_year, p_month, 1),
      (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::DATE,
      INTERVAL '1 day'
    ) AS d
  ) g ON EXTRACT(ISODOW FROM g.gun) = s.weekday
  WHERE s.student_id = p_student_id
    AND s.status = 'active'
    AND g.gun >= s.start_date;

  -- 1) ORTAK GRUP OTURUMU. Grup dersinde tek bir gerçek vardır; on
  -- öğrenci için on ayrı "ders yapıldı mı" kararı olamaz.
  INSERT INTO public.group_sessions (
    workspace_id, group_id, planned_at, duration_minutes, status
  )
  SELECT DISTINCT workspace_id, group_id, planned_at, duration, 'planlandi'
  FROM tmp_slotlar
  WHERE group_id IS NOT NULL
  ON CONFLICT (group_id, planned_at) DO NOTHING;

  -- 2) ÖĞRENCİ OTURUMU, grup satırına bağlı.
  WITH eklenen AS (
    INSERT INTO public.service_sessions (
      workspace_id, student_id, service_id, planned_at, duration_minutes,
      status, group_session_id
    )
    SELECT
      t.workspace_id, t.student_id, t.service_id, t.planned_at, t.duration,
      'planlandi', gs.id
    FROM tmp_slotlar t
    LEFT JOIN public.group_sessions gs
      ON gs.group_id = t.group_id AND gs.planned_at = t.planned_at
    -- Kısmi tekil indeks telafi satırlarını kapsamadığı için ON CONFLICT
    -- hedefi WHERE yüklemiyle birlikte verilmeli.
    ON CONFLICT (service_id, planned_at) WHERE makeup_of_session_id IS NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_created FROM eklenen;

  -- 3) GERİYE DÖNÜK BAĞ. 083 öncesinde üretilmiş satırlarda
  -- `group_session_id` NULL kaldı; fan-out onları göremezdi.
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

-- ============================================================
-- 3) set_group_session_outcome — TEK İŞLEMLE tüm gruba
-- ============================================================

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

  IF p_status NOT IN ('planlandi', 'yapildi', 'ertelendi', 'iptal', 'yapilmadi') THEN
    RAISE EXCEPTION 'Geçersiz görüşme durumu.';
  END IF;

  UPDATE public.group_sessions
  SET status           = p_status,
      actual_at        = COALESCE(p_actual_at, actual_at),
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      note             = COALESCE(p_note, note),
      updated_at       = NOW()
  WHERE id = p_group_session_id;

  -- FAN-OUT: yalnız AKTİF hizmeti olan öğrenciler.
  --
  -- Pasife alınmış bir hizmetin geçmiş oturumu grupla birlikte
  -- güncellenmemeli: öğrenci o tarihte artık grupta değildi ve
  -- geçmişini geriye dönük değiştirmek §5'in "geçmiş kayıtları
  -- geriye dönük değiştirmez" kuralını bozardı.
  --
  -- "KATILMADI" İSTİSNASI EZİLMEZ: attended = FALSE olan satır
  -- dışarıda kalır. Aksi hâlde öğretmenin işlem sırası veriyi
  -- belirlerdi — önce istisnayı girip sonra grubu işaretlemek onu
  -- silerdi.
  WITH guncellenen AS (
    UPDATE public.service_sessions ss
    SET status           = p_status,
        actual_at        = COALESCE(p_actual_at, ss.actual_at),
        duration_minutes = COALESCE(p_duration_minutes, ss.duration_minutes),
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
-- 4) set_session_attendance — öğrenci bazında "Katılmadı"
-- ============================================================
--
-- Grup dersi YAPILDI ama bu öğrenci gelmedi. Oturumu "Yapılmadı"
-- işaretlemek yanlış olurdu: ders gerçekleşti, öğretmen emeğini verdi;
-- eksik olan tek öğrencinin katılımı.

CREATE OR REPLACE FUNCTION public.set_session_attendance(
  p_session_id UUID,
  p_attended   BOOLEAN
)
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
    RAISE EXCEPTION 'Görüşme kaydı bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_row.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_row.group_session_id IS NULL THEN
    -- Birebir oturumda "katılmadı" ayrı bir durum değildir; orada
    -- doğru kayıt "Yapılmadı"dır ve telafi kararı ona bağlanır.
    RAISE EXCEPTION 'Katılım istisnası yalnız grup oturumlarında tutulur.';
  END IF;

  UPDATE public.service_sessions
  SET attended   = p_attended,
      updated_at = NOW()
  WHERE id = p_session_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_session_attendance(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_session_attendance(UUID, BOOLEAN) TO authenticated;
