-- ============================================================
-- 072_profile_and_workspace_rename
--
-- SORUN: koçun kendi adını ya da çalışma alanının adını
-- değiştirebileceği HİÇBİR yol yoktu. `profiles.full_name` yalnız
-- `create_teacher_workspace` ve `accept_invitation` içinde yazılıyor;
-- `workspaces.name` yalnız oluşturmada. Kayıt ekranı kullanıcıya
-- "adı sonradan ayarlardan değiştirebilirsiniz" diyor ama o ekran hiç
-- yazılmamıştı — ürün, tutamayacağı bir söz veriyordu.
--
-- Ad yanlış yazıldığında bu kozmetik bir sorun değil: koçun adı
-- öğrenciye ve veliye gönderilen davetlerde, raporlarda ve sol menüde
-- görünüyor.
--
-- İKİ AYRI FONKSİYON, İKİ AYRI YETKİ:
--   update_my_profile   — herkes KENDİ adını değiştirir. Hedef satır
--                         parametreyle gelmiyor; auth.uid() ile
--                         bulunuyor, yani başkasının adı yazılamaz.
--   rename_workspace    — yalnız `owner`. Çalışma alanı adı ortak bir
--                         nesne; ekibe davet edilmiş bir öğretmenin
--                         kurumun adını değiştirmesi için sebep yok.
--
-- E-POSTA BURADA DEĞİŞTİRİLMEZ: `profiles.email` yalnız bir kopya,
-- gerçek kimlik auth.users'ta ve onu değiştirmek doğrulama akışı
-- gerektirir. Yarım bir e-posta değişikliği, kullanıcının giriş
-- yapamamasıyla sonuçlanır.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_my_profile(p_full_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_name       TEXT;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_name := NULLIF(TRIM(COALESCE(p_full_name, '')), '');

  -- Sınır uygulama katmanındakiyle aynı (lib/validation.ts). İkisi de
  -- olmalı: form atlanabilir, veritabanı atlanamaz.
  IF v_name IS NULL OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'Ad Soyad en az 2 karakter olmalı';
  END IF;

  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Ad Soyad en fazla 120 karakter olabilir';
  END IF;

  UPDATE public.profiles
  SET full_name = v_name, updated_at = NOW()
  WHERE id = v_profile_id;

  RETURN jsonb_build_object('full_name', v_name);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.rename_workspace(
  p_workspace_id UUID,
  p_name         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_name TEXT;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Kütüphane alanının adı ürünün bir parçası, bir kiracının tercihi
  -- değil: adı değişirse yönetim ekranındaki metinler yalan söyler.
  IF EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND is_library
  ) THEN
    RAISE EXCEPTION 'Kütüphane çalışma alanının adı değiştirilemez';
  END IF;

  v_name := NULLIF(TRIM(COALESCE(p_name, '')), '');

  IF v_name IS NULL OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'Çalışma alanı adı en az 2 karakter olmalı';
  END IF;

  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Çalışma alanı adı en fazla 120 karakter olabilir';
  END IF;

  UPDATE public.workspaces
  SET name = v_name, updated_at = NOW()
  WHERE id = p_workspace_id;

  RETURN jsonb_build_object('name', v_name);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rename_workspace(UUID, TEXT) TO authenticated;


-- ============================================================
-- ROLLBACK
--
-- Değiştirilmiş adlar KALIR: geri almak, kullanıcının bilerek yaptığı
-- düzeltmeyi eski yazım hatasına döndürmek olurdu.
--
--   DROP FUNCTION IF EXISTS public.rename_workspace(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.update_my_profile(TEXT);
-- ============================================================
