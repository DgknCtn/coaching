-- ============================================================
-- 099 — ÜCRETSİZ DENEME 7 GÜNDEN 3 GÜNE İNİYOR (R8)
--
-- Ürün kararı: deneme süresi 3 gün.
--
-- NEDEN BU DOSYA VAR
-- Deneme süresi İKİ YERDE yazılı: `lib/plans.ts`'teki TRIAL_DAYS sabiti
-- (vitrin, CTA metni, geri sayım, engelleme mesajı oradan okur) ve
-- `create_teacher_workspace` içindeki INTERVAL (yeni alanın
-- `trial_ends_at` değerini fiilen yazan yer). Yalnız sabiti düşürmek,
-- kullanıcıya "3 gün" derken veritabanında 7 gün açmak olurdu; bu,
-- 052'de denemenin hiç dolmaması kusurunun bir başka biçimi.
-- tests/plans.test.ts bu iki yerin ayrışmasını pahalı kılıyor.
--
-- SÜRESİ DEVAM EDEN DENEMELERE DOKUNULMUYOR — BİLİNÇLİ
-- Burada bir UPDATE YOK. Süresi işleyen bir denemeyi geriye dönük 3 güne
-- çekmek, kullanıcıya verilmiş bir günü geri almak ve bir kısmının
-- erişimini UYARISIZ kesmek demekti. 14→7 inişinde de aynı karar
-- verilmişti (DOKUMANTASYON.md). Yeni kural yalnız BUNDAN SONRA açılan
-- alanlara işler; süren denemeler kendi `trial_ends_at` değerleriyle
-- normal şekilde dolar.
--
-- GÖVDE 095'İN AYNISI. Değişen tek şey INTERVAL. Fonksiyon baştan
-- yazılıyor çünkü PostgreSQL'de bir fonksiyonun tek satırını yamalamanın
-- yolu yok; imza ve dönüş tipi değişmediği için CREATE OR REPLACE
-- yeterli, DROP gerekmiyor.
--
-- GERİ ALMA: 095'teki gövdeyi yeniden uygulamak yeterli (INTERVAL '7 days').
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

  -- ---------- TEKİLLİK: alan zaten varsa yenisi açılmaz ----------
  --
  -- Ölçüt üyelik değil SAHİPLİK: bir öğretmen başka bir kuruma davetle
  -- teacher olarak katılmış olabilir ve bu, kendi alanını açma hakkını
  -- kaldırmaz. Kütüphane alanı (069) bir kiracı değil, o yüzden dışarıda.
  SELECT w.id INTO v_workspace_id
  FROM public.workspaces w
  WHERE w.owner_profile_id = v_profile_id
    AND w.type = 'individual'
    AND COALESCE(w.is_library, FALSE) = FALSE
  ORDER BY w.created_at
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    -- Varsayılanı boş bırakmamak bir onarımdır, üzerine yazmak değil:
    -- kullanıcının seçtiği aktif alan çerezde tutuluyor (Faz 3) ve
    -- buradaki koşul onu etkilemez.
    UPDATE public.profiles
    SET default_workspace_id = v_workspace_id
    WHERE id = v_profile_id AND default_workspace_id IS NULL;

    RETURN jsonb_build_object(
      'profile_id',   v_profile_id,
      'workspace_id', v_workspace_id,
      'created',      FALSE
    );
  END IF;

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
    v_ws_name, 'individual', v_profile_id, 'trial', NOW() + INTERVAL '3 days',
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

  RETURN jsonb_build_object(
    'profile_id',   v_profile_id,
    'workspace_id', v_workspace_id,
    'created',      TRUE
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
