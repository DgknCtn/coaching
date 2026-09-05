-- ============================================================
-- 064 — VARSAYILAN ÇALIŞMA ALANI ADI TÜRKÇELEŞİYOR
--
-- SORUN: kayıt formundan "Çalışma Alanı Adı" alanı kaldırıldı. Alan
-- zaten isteğe bağlıydı ve ilk kayıtta "çalışma alanı nedir?" sorusunu
-- doğuruyordu. Ama kalkınca ARTIK HERKES sunucu varsayılanını alıyor:
--
--   p_full_name || ' Workspace'   ->   "Doğukan Çetin Workspace"
--
-- Türkçe bir üründe İngilizce bir sözcük, üstelik kullanıcının kendi
-- adının yanında. Bu ad `WorkspaceSwitcher`'da görünüyor ve sidebar'ın
-- üstü artık marka adını gösterdiği için çalışma alanı adının TEK
-- görünür yeri orası.
--
-- MEVCUT KAYITLAR DEĞİŞTİRİLMİYOR. Kullanıcının verisini sessizce
-- yeniden adlandırmak, adı bilinçli seçmiş olabilecek biri için
-- sürprizdir; üstelik "Workspace" ile biten her adı düzeltmeye kalkmak
-- kullanıcının kendi yazdığı adları da vururdu.
--
-- Fonksiyon gövdesi 059'daki hâliyle aynı; yalnız v_ws_name satırı
-- değişiyor. Dönüş tipi ve imza değişmediği için CREATE OR REPLACE
-- yeterli.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_teacher_workspace(
  p_auth_user_id  UUID,
  p_full_name     TEXT,
  p_email         TEXT,
  p_workspace_name TEXT DEFAULT NULL,
  p_partner_code  TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id    UUID;
  v_workspace_id  UUID;
  v_ws_name       TEXT;
  v_partner_id    UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_auth_user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (p_auth_user_id, p_full_name, p_email)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        updated_at = NOW()
  RETURNING id INTO v_profile_id;

  -- 064: ' Workspace' -> ' Çalışma Alanı'
  v_ws_name := COALESCE(NULLIF(p_workspace_name, ''), p_full_name || ' Çalışma Alanı');

  -- Geçersiz kod SESSİZCE YOK SAYILIR: kullanıcı yanlış bir bağlantıdan
  -- geldi diye kaydı reddetmek, bize müşteri kaybettirir.
  IF p_partner_code IS NOT NULL THEN
    v_partner_id := public.resolve_partner_code(p_partner_code);
  END IF;

  INSERT INTO public.workspaces (
    name, type, owner_profile_id, plan, trial_ends_at,
    referred_by_partner_id, referred_at
  )
  VALUES (
    v_ws_name, 'individual', v_profile_id, 'trial', NOW() + INTERVAL '7 days',
    v_partner_id,
    CASE WHEN v_partner_id IS NOT NULL THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'owner', 'active');

  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'teacher', 'active');

  UPDATE public.profiles
  SET default_workspace_id = v_workspace_id
  WHERE id = v_profile_id;

  RETURN jsonb_build_object('profile_id', v_profile_id, 'workspace_id', v_workspace_id);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- GERİ ALMA (elle): v_ws_name satırını 059'daki hâline döndürün
--   v_ws_name := COALESCE(NULLIF(p_workspace_name, ''), p_full_name || ' Workspace');
-- ============================================================
