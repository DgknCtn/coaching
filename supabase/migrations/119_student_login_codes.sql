-- ============================================================
-- 119 — E-POSTASIZ ÖĞRENCİ GİRİŞİ: KULLANICI ADI + PIN
--
-- ============================================================
-- NEDEN
--
-- Özellikle LGS ve ortaokul öğrencilerinin çoğunun kendi e-postası yok;
-- öğrenci eklemek e-posta istediği için öğretmen velinin adresini ya da
-- uydurma bir adres yazıyordu. Öğretmen artık öğrenciye kısa bir
-- KULLANICI ADI ve 6 haneli PIN veriyor.
--
-- ============================================================
-- GÜVENLİK TASARIMI — PIN BİR SUPABASE ŞİFRESİ DEĞİL
--
-- 6 haneli PIN doğrudan Supabase şifresi olsaydı, auth API'si anon
-- anahtarla uygulamamızın hız sınırını hiç görmeden denenebilirdi
-- (1.000.000 olasılık). Bu yüzden iki katman:
--
--   1. Supabase hesabının şifresi SUNUCUDAKİ bir sırdan türetilir
--      (HMAC(STUDENT_LOGIN_SECRET, kullanıcı adı)) — dışarıdan
--      tahmin edilemez, PIN'le ilgisi yoktur.
--   2. PIN bu tabloda bcrypt ile tutulur ve YALNIZ verify_student_pin
--      ile doğrulanır: 5 hatalı denemede 15 dakika kilit. Kilit
--      veritabanında; uygulamayı atlayıp RPC'yi doğrudan çağıran da
--      aynı kilide takılır.
--
-- PIN yenilemek / girişi kapatmak yalnız bu tabloyu değiştirir; auth
-- hesabına dokunulmaz (service key gerekmez — 056 kararı).
--
-- Tablo HİÇBİR rol tarafından doğrudan okunamaz (politika yok): hash
-- öğretmene de gösterilmez. Erişim yalnız aşağıdaki fonksiyonlarla.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_login_codes (
  student_id            UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Küçük harf, rakam, nokta: "ayse.y4821". Tekil (tüm platformda):
  -- giriş ekranı alan sormuyor.
  username              TEXT NOT NULL CHECK (username ~ '^[a-z0-9][a-z0-9.]{2,29}$'),
  pin_hash              TEXT NOT NULL,
  active                BOOLEAN NOT NULL DEFAULT true,
  failed_attempts       INT NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_student_login_username
  ON public.student_login_codes (username);

DROP TRIGGER IF EXISTS trg_student_login_codes_updated_at ON public.student_login_codes;
CREATE TRIGGER trg_student_login_codes_updated_at
  BEFORE UPDATE ON public.student_login_codes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.student_login_codes ENABLE ROW LEVEL SECURITY;
-- Bilinçli olarak POLİTİKA YOK: doğrudan okuma/yazma herkese kapalı.
REVOKE ALL ON public.student_login_codes FROM anon, authenticated;


-- ------------------------------------------------------------
-- 1) Öğretmen: kod oluştur / PIN yenile
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_student_login_code(
  p_student_id UUID,
  p_username   TEXT,
  p_pin        TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $fn$
DECLARE
  v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.students WHERE id = p_student_id;
  IF v_ws IS NULL OR NOT public.has_workspace_role(v_ws, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF p_pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be 6 digits';
  END IF;

  INSERT INTO public.student_login_codes
    (student_id, workspace_id, username, pin_hash, active, failed_attempts, locked_until, created_by_profile_id)
  VALUES
    (p_student_id, v_ws, lower(p_username), extensions.crypt(p_pin, extensions.gen_salt('bf')),
     true, 0, NULL, public.current_profile_id())
  ON CONFLICT (student_id) DO UPDATE
    SET pin_hash        = EXCLUDED.pin_hash,
        active          = true,
        failed_attempts = 0,
        locked_until    = NULL;
  -- Kullanıcı adı ilk oluşturmada sabitlenir: yenilemede DEĞİŞMEZ
  -- (auth hesabının adresi ona bağlı).
END;
$fn$;

-- ------------------------------------------------------------
-- 2) Öğretmen: girişi kapat
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disable_student_login_code(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.students WHERE id = p_student_id;
  IF v_ws IS NULL OR NOT public.has_workspace_role(v_ws, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  UPDATE public.student_login_codes SET active = false WHERE student_id = p_student_id;
END;
$fn$;

-- ------------------------------------------------------------
-- 3) Öğretmen: durum (hash ASLA dönmez)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_login_code_info(p_student_id UUID)
RETURNS TABLE (username TEXT, active BOOLEAN, locked BOOLEAN, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws UUID;
BEGIN
  SELECT s.workspace_id INTO v_ws FROM public.students s WHERE s.id = p_student_id;
  IF v_ws IS NULL OR NOT public.has_workspace_role(v_ws, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  RETURN QUERY
    SELECT c.username, c.active, (c.locked_until IS NOT NULL AND c.locked_until > NOW()), c.updated_at
    FROM public.student_login_codes c
    WHERE c.student_id = p_student_id;
END;
$fn$;

-- ------------------------------------------------------------
-- 4) Giriş: PIN doğrula (oturumsuz çağrılır)
--
-- Yalnız TRUE/FALSE döner — kullanıcı adının var olup olmadığını ya da
-- kilitli olduğunu söylemez (numaralandırmaya kapalı). Kilit: 5 hata,
-- 15 dakika.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_student_pin(p_username TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $fn$
DECLARE
  v_row public.student_login_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.student_login_codes
  WHERE username = lower(p_username) FOR UPDATE;

  IF NOT FOUND OR NOT v_row.active THEN
    RETURN FALSE;
  END IF;
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > NOW() THEN
    RETURN FALSE;
  END IF;

  IF v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) THEN
    UPDATE public.student_login_codes
      SET failed_attempts = 0, locked_until = NULL
      WHERE student_id = v_row.student_id;
    RETURN TRUE;
  END IF;

  UPDATE public.student_login_codes
    SET failed_attempts = v_row.failed_attempts + 1,
        locked_until = CASE WHEN v_row.failed_attempts + 1 >= 5
                            THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
    WHERE student_id = v_row.student_id;
  RETURN FALSE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_student_login_code(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disable_student_login_code(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_login_code_info(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_student_pin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_student_login_code(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_student_login_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_login_code_info(UUID) TO authenticated;
-- Giriş ekranı oturumsuz: anon çağırabilir. Kilit veritabanında.
GRANT EXECUTE ON FUNCTION public.verify_student_pin(TEXT, TEXT) TO anon, authenticated;


-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $dogrula$
BEGIN
  IF has_table_privilege('anon', 'public.student_login_codes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.student_login_codes', 'SELECT') THEN
    RAISE EXCEPTION '119 DOĞRULAMA: PIN tablosu doğrudan okunabiliyor.';
  END IF;
  IF has_function_privilege('anon', 'public.set_student_login_code(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '119 DOĞRULAMA: anon PIN yazabiliyor.';
  END IF;
  -- bcrypt gerçekten çalışıyor mu (extensions şeması, 110'daki tuzak).
  IF extensions.crypt('123456', extensions.crypt('123456', extensions.gen_salt('bf')))
     IS NULL THEN
    RAISE EXCEPTION '119 DOĞRULAMA: pgcrypto erişilemiyor.';
  END IF;
  RAISE NOTICE '119: PIN tablosu kapalı, fonksiyonlar yetkileriyle yerinde.';
END;
$dogrula$;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.verify_student_pin(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.student_login_code_info(UUID);
--   DROP FUNCTION IF EXISTS public.disable_student_login_code(UUID);
--   DROP FUNCTION IF EXISTS public.set_student_login_code(UUID, TEXT, TEXT);
--   DROP TABLE IF EXISTS public.student_login_codes;
