-- ============================================================
-- 075_service_sessions_rpc  (R7 / Site Testi 04 Rev.3)
--
-- 074 tabloları kurdu; burada onları güvenle değiştiren işlemler var.
--
-- NEDEN RPC: yazma yolları RLS'in ötesinde iş kuralı taşıyor —
-- "planlanan tarih üzerine yazılmaz", "telafi asıl aya aittir",
-- "grup oturumu tek işlemle N öğrenciye yansır". Bu kurallar istemcide
-- dursaydı her ekran kendi kopyasını üretir ve biri er geç ayrışırdı.
--
-- HEPSİ SECURITY DEFINER + açık yetki kontrolü: RLS'i aşan bir fonksiyon
-- yetkiyi kendisi doğrulamak zorundadır.
-- ============================================================


-- ============================================================
-- 1) generate_service_sessions — ayın gerçek takviminden oturum üretimi
--
-- "AYIN TAKVİMİNDE 5 DÜZENLİ GÜN VARSA 5 HİZMET PLANLANIR" (§8).
-- 'Aylık paket = 4 görüşme' varsayımı YAPILMAZ.
--
-- İDEMPOTENT: uniq_service_session_slot sayesinde aynı slot ikinci kez
-- üretilmez. Fonksiyon dashboard/ekran açılışında tembel olarak
-- çağrılabilsin diye böyle — 016'daki ensure_student_check_ins ile aynı
-- yaklaşım, ayrı bir cron altyapısı gerektirmez.
--
-- SAAT: hizmet "Çarşamba 20:00" der; bu bir DUVAR SAATİDİR. Sunucu UTC
-- çalıştığı için dönüşüm AT TIME ZONE 'Europe/Istanbul' ile açıkça
-- yapılır. Aksi hâlde her ders 3 saat kayardı.
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
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Geçersiz ay';
  END IF;

  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Geçersiz yıl';
  END IF;

  WITH ay AS (
    SELECT make_date(p_year, p_month, 1) AS ilk_gun
  ),
  gunler AS (
    SELECT d::DATE AS gun
    FROM ay, generate_series(
      ay.ilk_gun,
      (ay.ilk_gun + INTERVAL '1 month - 1 day')::DATE,
      INTERVAL '1 day'
    ) AS d
  ),
  slotlar AS (
    SELECT
      s.id           AS service_id,
      s.workspace_id,
      s.student_id,
      s.planned_duration_minutes,
      -- Duvar saatini gerçek ana çevir.
      ((g.gun + s.start_time) AT TIME ZONE 'Europe/Istanbul') AS planned_at
    FROM public.student_services s
    JOIN gunler g
      ON EXTRACT(ISODOW FROM g.gun) = s.weekday
    WHERE s.student_id = p_student_id
      AND s.status = 'active'
      AND g.gun >= s.start_date
  ),
  eklenen AS (
    INSERT INTO public.service_sessions (
      workspace_id, student_id, service_id, planned_at, duration_minutes, status
    )
    SELECT
      workspace_id, student_id, service_id, planned_at, planned_duration_minutes, 'planlandi'
    FROM slotlar
    -- Kısmi tekil indeks telafi satırlarını kapsamadığı için ON CONFLICT
    -- hedefi WHERE yüklemiyle birlikte verilmeli.
    ON CONFLICT (service_id, planned_at) WHERE makeup_of_session_id IS NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_created FROM eklenen;

  RETURN v_created;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.generate_service_sessions(UUID, INTEGER, INTEGER) TO authenticated;


-- ============================================================
-- 2) set_session_outcome — görüşme sonrası kesinleşmiş durum
--
-- §7.B: sistem otomatik "Yapılmadı" DEMEZ. Bu fonksiyon yalnız
-- öğretmenin açık kararıyla çağrılır.
--
-- `p_actual_at` verilmezse ve durum 'yapildi' ise planlanan an
-- gerçekleşme anı sayılır — öğretmen dersi zamanında yaptıysa ikinci bir
-- tarih girmesi istenmez.
-- ============================================================
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

  IF p_status NOT IN ('planlandi', 'yapildi', 'iptal', 'yapilmadi') THEN
    -- 'ertelendi' buradan yazılmaz; erteleme reschedule_session'ın işi
    -- çünkü yeni tarihi de kaydetmesi gerekir.
    RAISE EXCEPTION 'Geçersiz görüşme durumu: %', p_status;
  END IF;

  UPDATE public.service_sessions
  SET status    = p_status,
      -- planned_at'e DOKUNULMAZ: ilk taahhüt geçmişte kalır.
      actual_at = CASE
                    WHEN p_status = 'yapildi'
                      THEN COALESCE(p_actual_at, actual_at, planned_at)
                    ELSE p_actual_at
                  END,
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      attended  = COALESCE(p_attended, attended),
      note      = COALESCE(NULLIF(TRIM(COALESCE(p_note, '')), ''), note)
  WHERE id = p_session_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_session_outcome(UUID, TEXT, TIMESTAMPTZ, SMALLINT, BOOLEAN, TEXT) TO authenticated;


-- ============================================================
-- 3) reschedule_session — tek seferlik tarih/saat değişikliği
--
-- §7.A: İLK planlanan tarih/saat SİLİNMEZ; yeni kesinleşmiş tarih AYNI
-- kayda bağlanır. Öğrenci ve veli ekranı "19 Eyl 10:00 -> 20 Eyl 11:00"
-- diyebilsin diye.
--
-- HAFTALIK AKIŞA DOKUNMAZ: bu oturum ana temas olsa bile aktif akışın
-- Son Teslimi burada değiştirilmez. Karar öğretmenindir ve arayüz ayrıca
-- sorar (§7.A.4). Sessizce taşımak, öğrencinin haftasını haber vermeden
-- uzatmak/kısaltmak olurdu.
-- ============================================================
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

  UPDATE public.service_sessions
  SET status    = 'ertelendi',
      actual_at = p_new_at,
      note      = COALESCE(NULLIF(TRIM(COALESCE(p_note, '')), ''), note)
  WHERE id = p_session_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.reschedule_session(UUID, TIMESTAMPTZ, TEXT) TO authenticated;


-- ============================================================
-- 4) create_makeup_session — telafi
--
-- §7.C: telafi HANGİ AYDA yapılırsa yapılsın ASIL ayın hizmet borcuna
-- aittir. Bu yüzden telafi satırı kendi tarihiyle değil,
-- `makeup_of_session_id` bağıyla sayılır (bkz. student_service_month_view).
-- Bağ olmasaydı Ekim'de yapılan bir Eylül telafisi Ekim paketine
-- fazladan hizmet yazardı.
-- ============================================================
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
    -- Telafinin telafisi zinciri, asıl ayın hangi oturuma ait olduğunu
    -- belirsizleştirir. Tek seviye yeterli.
    RAISE EXCEPTION 'Bu kayıt zaten bir telafi; telafinin telafisi oluşturulamaz';
  END IF;

  INSERT INTO public.service_sessions (
    workspace_id, student_id, service_id, planned_at, duration_minutes,
    status, makeup_of_session_id, created_by_profile_id
  )
  VALUES (
    v_origin.workspace_id, v_origin.student_id, v_origin.service_id, p_planned_at,
    v_origin.duration_minutes, 'planlandi', v_origin.id, public.current_profile_id()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_makeup_session(UUID, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- 5) set_service_status — Pasife Al / Yeniden Aktifleştir
--
-- §5.1: hizmet SİLİNMEZ. Silinseydi geçmiş oturumlar sahipsiz kalır ve
-- sezon özeti geriye dönük değişirdi.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_service_status(
  p_service_id UUID,
  p_status     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_services WHERE id = p_service_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Hizmet bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_status NOT IN ('active', 'passive') THEN
    RAISE EXCEPTION 'Geçersiz hizmet durumu: %', p_status;
  END IF;

  UPDATE public.student_services SET status = p_status WHERE id = p_service_id;

  -- Pasife alınan hizmetin HENÜZ YAPILMAMIŞ oturumları düşer; geçmiş
  -- kayıtlara dokunulmaz (§5.7 "geçmiş gerçekleşmiş kayıtlar değişmez").
  IF p_status = 'passive' THEN
    DELETE FROM public.service_sessions
    WHERE service_id = p_service_id
      AND status = 'planlandi'
      AND planned_at > NOW();
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_service_status(UUID, TEXT) TO authenticated;


-- ============================================================
-- 6) student_service_month_view — aylık hizmet sayacı
--
-- §3.1/3.3: "Bu ay planlanan / yapılan / kalan", hizmet bazlı ayrı
-- sayaçlarla ("Grup 4/5", "Koçluk 3/4").
--
-- AY ATAMASI TELAFİYİ ASIL AYA YAZAR: satırın ayı, telafi ise bağlı
-- olduğu asıl oturumun planlanan ayıdır. Böylece "sonraki ay yapılan
-- telafi asıl ayın hizmet borcunu kapatır; yeni aya ekstra hizmet
-- yazmaz" kabul kriteri şemadan gelir, ekran hesabından değil.
-- ============================================================
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
    -- Telafi asıl oturumun ayına yazılır.
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
  -- Grupta "Katılmadı" istisnası olan oturum yapılmış sayılmaz.
  COUNT(*) FILTER (WHERE a.status = 'yapildi'
                     AND COALESCE(a.attended, TRUE))                 AS yapilan,
  COUNT(*) FILTER (WHERE a.status IN ('planlandi', 'ertelendi'))     AS bekleyen,
  COUNT(*) FILTER (WHERE a.status = 'yapilmadi')                     AS yapilmayan,
  COUNT(*) FILTER (WHERE a.status = 'iptal')                         AS iptal,
  COALESCE(SUM(a.duration_minutes) FILTER (WHERE a.status = 'yapildi'
                     AND COALESCE(a.attended, TRUE)), 0)             AS yapilan_dakika
FROM atanmis a
JOIN public.student_services sv ON sv.id = a.service_id
GROUP BY a.workspace_id, a.student_id, a.service_id,
         sv.kind, sv.participation, sv.medium, a.ay;

-- 049'un kuralı: view çağıranın yetkisiyle çalışır, tanımlayanın
-- değil. Aksi hâlde PostgREST üzerinden RLS'siz okunabilirdi.
ALTER VIEW public.student_service_month_view SET (security_invoker = on);

GRANT SELECT ON public.student_service_month_view TO authenticated;


-- ============================================================
-- 7) student_season_summary_view — sezon özeti (§9)
--
-- Öğrenci başına toplam oturum ve toplam süre. Parasal toplamlar
-- BİLİNÇLİ OLARAK BURADA DEĞİL: tahakkuk ve tahsilat 066'daki
-- student_finance_view'ın işidir ve iki yerde toplanan bir para,
-- er geç iki farklı sayı demektir.
-- ============================================================
CREATE OR REPLACE VIEW public.student_season_summary_view AS
SELECT
  ss.workspace_id,
  ss.student_id,
  sv.kind,
  sv.participation,
  COUNT(*) FILTER (WHERE ss.status = 'yapildi'
                     AND COALESCE(ss.attended, TRUE))            AS oturum,
  COALESCE(SUM(ss.duration_minutes) FILTER (WHERE ss.status = 'yapildi'
                     AND COALESCE(ss.attended, TRUE)), 0)        AS toplam_dakika
FROM public.service_sessions ss
JOIN public.student_services sv ON sv.id = ss.service_id
GROUP BY ss.workspace_id, ss.student_id, sv.kind, sv.participation;

ALTER VIEW public.student_season_summary_view SET (security_invoker = on);

GRANT SELECT ON public.student_season_summary_view TO authenticated;
