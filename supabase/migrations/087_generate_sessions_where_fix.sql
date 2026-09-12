-- ============================================================
-- 087 — generate_service_sessions: WHERE'siz DELETE düzeltmesi
-- ============================================================
--
-- BELİRTİ: Görüşmeler ekranı (/teacher/students/:id/gorusmeler) açıldığında
-- sunucu günlüğüne şu düşüyordu:
--
--   [gorusmeler] oturum üretilemedi: {"message":"DELETE requires a WHERE clause"}
--
-- Sayfa yine de çiziliyordu, çünkü çağıran taraf hatayı bilinçli olarak
-- yutuyor ("üretilememiş oturum, bütün sayfayı göstermemek için yeterli
-- bir sebep değil"). Bu karar doğru ama bir yan etkisi vardı: aylık
-- oturumlar HİÇ üretilmiyordu ve kullanıcıya hiçbir şey söylenmiyordu.
--
-- SEBEP: 083'teki fonksiyon geçici tabloyu `DELETE FROM tmp_slotlar;` ile
-- boşaltıyordu. Supabase, kazara tüm tabloyu silmeyi engelleyen safeupdate
-- korumasını açık tutuyor ve bu koruma GEÇİCİ tabloyu ayırt etmiyor.
--
-- ÇÖZÜM: yüklem eklendi (`WHERE true`). Anlam birebir aynı, koruma
-- karşılanıyor. TRUNCATE de işe yarardı ama o, fonksiyon içinde ayrı bir
-- kilit alır ve gereksiz.
--
-- İmza değişmediği için CREATE OR REPLACE yeterli; DROP gerekmiyor.
-- Dosya yeniden çalıştırılabilir.

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

  -- 087: `WHERE true` KOZMETİK DEĞİL, ZORUNLU.
  --
  -- Burası eskiden yalın `DELETE FROM tmp_slotlar;` idi. Supabase'in
  -- güvenlik ayarı (safeupdate) WHERE yüklemi olmayan DELETE'i
  -- reddediyor ve bunu GEÇİCİ tabloda da yapıyor. Sonuç: RPC her
  -- çağrıda 'DELETE requires a WHERE clause' ile patlıyor, Görüşmeler
  -- ekranı hatayı yutup sayfayı yine çiziyordu (bilinçli bir karar) —
  -- yani oturumlar hiç üretilmiyor, ekran boş görünüyor ve ortada
  -- görünür bir hata da olmuyordu.
  DELETE FROM tmp_slotlar WHERE true;

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
