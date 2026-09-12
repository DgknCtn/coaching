-- ============================================================
-- 095 — KAYIT BOOTSTRAP'I İDEMPOTENT OLUYOR
--
-- SORUN (12 Eylül 2026, saha raporu): tek bir e-posta için çalışma alanı
-- seçicide İKİ alan göründü ("burak Çalışma Alanı" ve "Burak Yakıcı") ve
-- ikincisine geçiş hata verdi. İki ayrı kusurun üst üste binmesiydi;
-- bu dosya veri tarafını kapatıyor (arayüz tarafı workspace-actions.ts).
--
-- `create_teacher_workspace` HER ÇAĞRIDA yeni bir workspace INSERT
-- ediyordu. Tek koruma çağıran taraftaydı (app/page.tsx'teki
-- `!profile?.default_workspace_id` kontrolü) ve o kontrol yarışa açık:
--
--   1. Doğrulama bağlantısı iki sekmede açılır / `/` iki kez render
--      edilir. İki istek de default_workspace_id'yi NULL görür.
--   2. İkisi de RPC'yi çağırır -> İKİ workspace, iki owner+teacher
--      üyeliği.
--   3. Sondaki `UPDATE profiles SET default_workspace_id` koşulsuz
--      olduğu için varsayılan SONRA bitene kayar; ilk alan sahipsiz
--      kalmaz — seçicide durur, kullanıcı hangisinin gerçek olduğunu
--      bilemez.
--
-- Kullanıcı hiçbir hata görmez. Sessiz veri çoğaltma, bildirilmesi en
-- zor kusur türü.
--
-- ÇÖZÜM: karar veritabanına taşınıyor. Profil zaten bir 'individual'
-- alanın SAHİBİYSE yeni alan açılmaz; var olanın id'si döner. Yarışın
-- ikinci ayağı da bu dalı görür, çünkü ilk ayak commit'ini yapmış olur.
--
-- NEDEN ÇAĞIRANA GÜVENİLMİYOR: bu RPC iki ayrı yerden çağrılıyor
-- (kayıt eylemi ve geç kurulum) ve üçüncü bir çağrı noktası eklendiğinde
-- kontrolü tekrar yazmayı unutmak, aynı kusuru geri getirir. Tekillik
-- "bir öğretmenin bir kurumu olur" iş kuralıdır; kuralın yeri veridir.
--
-- ONARIM DA YAPAR: alan varken profilin varsayılanı boş kalmışsa (eski
-- yarışların bıraktığı hâl) sessizce doğru alana bağlanır. Kullanıcı
-- böylece /login döngüsüne düşmez.
--
-- MEVCUT ÇİFT KAYITLAR BU DOSYADA TEMİZLENMİYOR. Hangi alanın gerçek
-- olduğuna ancak verisine bakılarak karar verilir (öğrenci, kitap,
-- ödeme); bunu körlemesine silmek veri kaybıdır. Temizlik elle, tek tek
-- yapılmalı — bu migration yalnız YENİ çiftlerin oluşmasını durdurur.
--
-- 064'ün gövdesiyle aynı; yalnız başa tekillik dalı eklendi. İmza ve
-- dönüş tipi değişmedi, CREATE OR REPLACE yeterli.
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
