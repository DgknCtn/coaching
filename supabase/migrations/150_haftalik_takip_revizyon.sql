-- ============================================================
-- 150 — M1.0-04: HİZMET İLK AKTİVASYON SİNYALİ
--
-- CANLI KULLANIM TESTİNDEN (M1.0-04 revizyon paketi, 21 Ekim 2026):
-- Pasif bir hizmet "Aktifleştir" ile açıldığında arayüz HER ZAMAN
-- "Hizmet yeniden aktifleştirildi." diyordu — ilk kez pasiften çıkan,
-- yani öğretmenin daha önce hiç gerçek anlamda çalıştırmadığı bir
-- hizmet için de aynı cümle. Kullanıcıya geçmişte aktif bir hizmet
-- kullanıldığı hissini veriyordu; oysa tek yaptığı taslağı açmaktı.
--
-- AYRIM YAPACAK VERİ YOKTU: create_student_service (139) her zaman
-- status='active' ile açıyor — bir hizmet doğrudan "pasif" doğamıyor.
-- student_services yalnız status/created_at/updated_at taşıyor; "bu
-- hizmet daha önce gerçekten aktif oldu mu" sorusuna cevap verecek
-- bir sütun hiç yoktu. Oturum sayısı da güvenilir sinyal değil:
-- oturumlar tembel/lazy üretiliyor (generate_service_sessions, 075),
-- aktif bir hizmetin de sayfa hiç açılmadıysa 0 oturumu olabilir.
--
-- ÇÖZÜM: student_services.activated_at — İLK status='active' olduğu
-- an. create_student_service'te hemen set edilir (hizmet zaten active
-- doğuyor). set_service_status'ta YALNIZ NULL ise doldurulur — yani
-- bu sütun hayatı boyunca bir kez, ilk gerçek aktivasyonda yazılır ve
-- bir daha asla değişmez. "activated_at IS NULL" (çağrı anında) =
-- "bu ilk aktivasyon" sinyali.
--
-- NEDEN RPC'DEN DÖNÜYOR, ÇAĞIRAN TARAFTAN DEĞİL: "ilk mi" sorusu
-- tam da bu UPDATE satırı kilitliyken en doğru cevaplanır. İstemcinin
-- önceden yüklediği `service.activatedAt` ile RPC'nin gerçekte
-- yazdığı an arasında (iki sekme/iki kullanıcı aynı anda tıklarsa)
-- yarış durumu doğardı; RPC içinde okuyup aynı transaction'da karar
-- vermek bunu kapatıyor.
--
-- DÖNÜŞ TİPİ DEĞİŞİYOR (VOID -> BOOLEAN): Postgres bunu CREATE OR
-- REPLACE ile kabul etmiyor, DROP FUNCTION önce şart (aşağıda).
--
-- GERİYE DÖNÜK DOLDURMA: hâlâ aktif olan hizmetler için created_at
-- ilk aktivasyon kabul edilir — bu hizmetler zaten 'active' doğmuştu,
-- başka bir an bilinmiyor ve created_at en doğru yaklaşıktır. Pasif/
-- arşiv hizmetler NULL kalır: "ilk aktivasyonları ne zamandı" bilgisi
-- kayıp, bir sonraki "Aktifleştir"de doğru şekilde "ilk kez" sayılırlar
-- — bu YANLIŞ DEĞİL, çünkü arayüz onlar için zaten hiç "aktif" halini
-- göstermemişti; şimdi gösterdiğinde "ilk kez" demesi doğru.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

ALTER TABLE public.student_services
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Yalnız activated_at NULL olan satırlar etkilenir (WHERE'li UPDATE —
-- idempotency kuralı).
UPDATE public.student_services
SET activated_at = created_at
WHERE status = 'active' AND activated_at IS NULL;

-- create_student_service: imza AYNI, yalnız activated_at = NOW() eklendi.
CREATE OR REPLACE FUNCTION public.create_student_service(
  p_student_id        UUID,
  p_kind              TEXT,
  p_participation     TEXT,
  p_medium            TEXT,
  p_group_id          UUID,
  p_cadence           TEXT,
  p_weekday           SMALLINT,
  p_start_time        TIME,
  p_weekday_2         SMALLINT,
  p_start_time_2      TIME,
  p_duration_minutes  SMALLINT,
  p_start_date        DATE,
  p_finance_link      TEXT,
  p_default_unit      NUMERIC,
  p_submission_offset INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_id        UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;
  IF p_cadence NOT IN ('haftada_1', 'haftada_2', 'esnek') THEN
    RAISE EXCEPTION 'Geçersiz ritim.';
  END IF;
  IF p_participation = 'grup' AND p_cadence = 'esnek' THEN
    RAISE EXCEPTION 'Grup dersi esnek ritimle tanımlanamaz.';
  END IF;
  IF p_participation = 'grup' AND p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_groups g
    WHERE g.id = p_group_id AND g.workspace_id = v_workspace
  ) THEN
    RAISE EXCEPTION 'Grup bulunamadı.';
  END IF;

  INSERT INTO public.student_services (
    workspace_id, student_id, kind, participation, medium, group_id,
    cadence, weekday, start_time, weekday_2, start_time_2,
    planned_duration_minutes, start_date, finance_link, default_unit_count,
    submission_offset_minutes, status, created_by_profile_id, activated_at
  )
  VALUES (
    v_workspace, p_student_id, p_kind, p_participation, p_medium,
    CASE WHEN p_participation = 'grup' THEN p_group_id END,
    p_cadence, p_weekday, p_start_time,
    CASE WHEN p_cadence = 'haftada_2' THEN p_weekday_2 END,
    CASE WHEN p_cadence = 'haftada_2' THEN p_start_time_2 END,
    p_duration_minutes, p_start_date, p_finance_link, COALESCE(p_default_unit, 1),
    COALESCE(p_submission_offset, 0), 'active', public.current_profile_id(), NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

-- set_service_status: DÖNÜŞ TİPİ VOID -> BOOLEAN. Postgres bu
-- değişikliği CREATE OR REPLACE ile kabul etmiyor ("cannot change
-- return type of existing function") — önce DROP şart.
DROP FUNCTION IF EXISTS public.set_service_status(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.set_service_status(
  p_service_id UUID,
  p_status     TEXT
)
RETURNS BOOLEAN  -- true: bu çağrı hizmeti İLK KEZ aktifleştirdi
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_was_null     BOOLEAN;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_services WHERE id = p_service_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Hizmet bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_status NOT IN ('active', 'passive', 'archived') THEN
    RAISE EXCEPTION 'Geçersiz hizmet durumu: %', p_status;
  END IF;

  SELECT activated_at IS NULL INTO v_was_null
  FROM public.student_services WHERE id = p_service_id;

  UPDATE public.student_services
  SET status = p_status,
      is_main_contact = CASE WHEN p_status = 'active' THEN is_main_contact ELSE FALSE END,
      activated_at = CASE
        WHEN p_status = 'active' THEN COALESCE(activated_at, NOW())
        ELSE activated_at
      END
  WHERE id = p_service_id;

  -- Gelecekte bekleyen, henüz yapılmamış oturumlar düşer; geçmiş
  -- kayıtlara dokunulmaz. (139'daki orijinal davranış, değişmedi.)
  IF p_status IN ('passive', 'archived') THEN
    DELETE FROM public.service_sessions
    WHERE service_id = p_service_id
      AND status = 'planlandi'
      AND planned_at > NOW();
  END IF;

  RETURN p_status = 'active' AND v_was_null;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_service_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_service_status(UUID, TEXT) TO authenticated;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
DO $yetki$
BEGIN
  IF (SELECT COUNT(*) FROM pg_proc WHERE proname = 'set_service_status') <> 1 THEN
    RAISE EXCEPTION '150 DOĞRULAMA: set_service_status fazla/eksik tanım.';
  END IF;

  IF has_function_privilege('anon', 'public.set_service_status(uuid,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '150 DOĞRULAMA: set_service_status anon''a açık.';
  END IF;

  IF pg_get_functiondef('public.set_service_status(uuid,text)'::regprocedure) NOT LIKE '%has_workspace_role%' THEN
    RAISE EXCEPTION '150 DOĞRULAMA: set_service_status yetki denetimi yapmıyor.';
  END IF;

  RAISE NOTICE '150: activated_at ve ilk-aktivasyon sinyali hazır.';
END;
$yetki$;

-- ROLLBACK:
--   ALTER TABLE public.student_services DROP COLUMN IF EXISTS activated_at;
--   DROP FUNCTION IF EXISTS public.set_service_status(UUID, TEXT);
--   -- ardından 139_service_cadence_and_pricing.sql'deki eski
--   -- RETURNS VOID tanımını (activated_at'siz) yeniden çalıştır.
