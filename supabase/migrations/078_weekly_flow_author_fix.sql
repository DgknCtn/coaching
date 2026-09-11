-- ============================================================
-- 078_weekly_flow_author_fix
--
-- SORUN: "Haftalık akışı aç" HER ZAMAN hata veriyordu.
--
--   insert or update on table "weekly_flows" violates foreign key
--   constraint "weekly_flows_created_by_profile_id_fkey"
--
-- 077:189 akışı açan kişiyi `auth.uid()` ile yazıyor, oysa sütun
-- `profiles(id)`'ye referans veriyor (077:62). Bu ikisi AYNI DEĞİL:
--
--   profiles.id           -> tablonun kendi birincil anahtarı
--   profiles.auth_user_id -> auth.uid()'nin karşılığı
--
-- Doğrusu 002:7'deki `public.current_profile_id()` yardımcısıdır ve
-- zaten repo genelinde bunun için var:
--
--   SELECT id FROM public.profiles WHERE auth_user_id = auth.uid();
--
-- 075:267 (`create_makeup_session`) aynı sütunu DOĞRU şekilde
-- `public.current_profile_id()` ile yazıyor — yani hata 077'ye özel bir
-- dikkatsizlik, kalıp değil.
--
-- NEDEN TESTTE YAKALANMADI: `open_weekly_flow` bir RPC; TypeScript
-- tarafı yalnız çağırıyor. `tests/weekly-flow.test.ts` saf fonksiyonları
-- doğruluyor, SQL'i çalıştırmıyor (repoda canlı veritabanı yok). Hata
-- ancak gerçek bir öğrencide akış açılmaya çalışılınca ortaya çıktı.
--
-- NEDEN 077 DÜZENLENMEDİ: 077 zaten çalıştırılmış bir migration.
-- Dosyayı geriye dönük değiştirmek, veritabanında olan ile depoda yazan
-- arasındaki tek bağı koparır — çalıştırılmış bir migration'ın metni
-- kayıttır. Düzeltme yeni dosyada gelir.
--
-- YENİDEN ÇALIŞTIRILABİLİR: tek ifade ve CREATE OR REPLACE (058'den
-- beri zorunlu — tests/migration-idempotency.test.ts).
-- ============================================================

CREATE OR REPLACE FUNCTION public.open_weekly_flow(
  p_student_id UUID,
  p_starts_at  TIMESTAMPTZ,
  p_due_at     TIMESTAMPTZ,
  p_due_source TEXT DEFAULT 'anchor',
  p_anchor_service_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_active_id    UUID;
  v_new_id       UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_due_source NOT IN ('anchor', 'custom') THEN
    RAISE EXCEPTION 'Geçersiz son teslim kaynağı.';
  END IF;

  IF p_due_at <= p_starts_at THEN
    RAISE EXCEPTION 'Son teslim, akışın başlangıcından sonra olmalı.';
  END IF;

  -- Açık akış varsa kapanır ve fotoğrafı çekilir. Silinmez (kabul #12).
  SELECT id INTO v_active_id
  FROM public.weekly_flows
  WHERE student_id = p_student_id AND status = 'active';

  IF v_active_id IS NOT NULL THEN
    PERFORM public.close_weekly_flow(v_active_id);
  END IF;

  INSERT INTO public.weekly_flows (
    workspace_id, student_id, anchor_service_id,
    starts_at, due_at, due_source, created_by_profile_id
  )
  VALUES (
    v_workspace_id, p_student_id, p_anchor_service_id,
    -- DÜZELTME: auth.uid() değil. Bkz. yukarıdaki açıklama.
    p_starts_at, p_due_at, p_due_source, public.current_profile_id()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.open_weekly_flow(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_weekly_flow(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) TO authenticated;
