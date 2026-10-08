-- ============================================================
-- 138 — ÖĞRENCİ VE VELİ İÇİN KULLANICI ADI + PIN; YANLIŞLIKLA AÇILAN
--       KOÇ ALANINI KAPATMA
--
-- ============================================================
-- 1) PIN TABLOSU PROFİLE BAĞLANIYOR
--
-- 119'da tablo öğrenciye (students.id) bağlıydı; velinin bir öğrenci
-- satırı yok. Anahtar artık HESAP (profiles.id): öğrenci de veli de
-- aynı tabloda, kullanıcı adı ikisi arasında tekil (giriş ekranı rol
-- sormuyor).
--
-- Güvenlik modeli 119'la AYNI: Supabase şifresi sunucudaki sırdan
-- türetilir, PIN yalnız burada bcrypt ile durur, 5 hata = 15 dk kilit,
-- hash hiçbir role dönmez, tablo doğrudan okunamaz.
--
-- Yetki: çağıran, hesabın AKTİF ÜYESİ olduğu çalışma alanında
-- owner/teacher olmalı — ve kod o alana yazılır. Başka bir alanın
-- öğretmeni aynı velinin PIN'ini değiştiremez.
--
-- ============================================================
-- 2) close_own_empty_workspace
--
-- Kayıt ekranını öğrenci sanıp koç alanı açan kullanıcı, alanı BOŞSA
-- kendisi kapatabilir. Koşullar sıkı: tek kişi, sahibi o, 14 günden
-- yeni, öğrenci/kitap/ödev/sipariş yok. Silme sırası 136'daki
-- admin_delete_workspace ile aynı.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.member_login_codes (
  profile_id            UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL CHECK (role IN ('student', 'parent')),
  username              TEXT NOT NULL CHECK (username ~ '^[a-z0-9][a-z0-9.]{2,29}$'),
  pin_hash              TEXT NOT NULL,
  active                BOOLEAN NOT NULL DEFAULT true,
  failed_attempts       INT NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_member_login_username
  ON public.member_login_codes (username);

DROP TRIGGER IF EXISTS trg_member_login_codes_updated_at ON public.member_login_codes;
CREATE TRIGGER trg_member_login_codes_updated_at
  BEFORE UPDATE ON public.member_login_codes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.member_login_codes ENABLE ROW LEVEL SECURITY;
-- Bilinçli olarak POLİTİKA YOK (119 ile aynı).
REVOKE ALL ON public.member_login_codes FROM anon, authenticated;

-- 119'daki satırlar taşınır. Hesabı bağlanmamış öğrenci satırı olamaz
-- (kod, kabulden SONRA yazılıyordu); yine de profile_id'siz olan atlanır.
INSERT INTO public.member_login_codes
  (profile_id, workspace_id, role, username, pin_hash, active, failed_attempts,
   locked_until, created_by_profile_id, created_at, updated_at)
SELECT s.profile_id, c.workspace_id, 'student', c.username, c.pin_hash, c.active,
       c.failed_attempts, c.locked_until, c.created_by_profile_id, c.created_at, c.updated_at
FROM public.student_login_codes c
JOIN public.students s ON s.id = c.student_id
WHERE s.profile_id IS NOT NULL
ON CONFLICT (profile_id) DO NOTHING;

DROP FUNCTION IF EXISTS public.verify_student_pin(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.disable_student_login_code(UUID);
DROP FUNCTION IF EXISTS public.set_student_login_code(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.student_login_code_info(UUID);
DROP TABLE IF EXISTS public.student_login_codes;


-- ------------------------------------------------------------
-- İç yardımcı: çağıran bu hesabın alanında öğretmen mi? Alanı döner.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_login_teacher_workspace(p_profile_id UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws UUID;
BEGIN
  SELECT m.workspace_id INTO v_ws
  FROM public.workspace_members m
  WHERE m.profile_id = p_profile_id
    AND m.status = 'active'
    AND m.role IN ('student', 'parent')
    AND public.has_workspace_role(m.workspace_id, ARRAY['owner', 'teacher'])
  ORDER BY m.created_at
  LIMIT 1;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  RETURN v_ws;
END;
$fn$;

-- ------------------------------------------------------------
-- 1) Öğretmen: kod oluştur / PIN yenile
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_login_code(
  p_profile_id UUID,
  p_role       TEXT,
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
  v_ws := public.member_login_teacher_workspace(p_profile_id);
  IF p_role NOT IN ('student', 'parent') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  -- Rol, hesabın o alandaki gerçek üyeliğiyle uyuşmalı.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_ws AND profile_id = p_profile_id
      AND role = p_role AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF p_pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be 6 digits';
  END IF;

  INSERT INTO public.member_login_codes
    (profile_id, workspace_id, role, username, pin_hash, active, failed_attempts,
     locked_until, created_by_profile_id)
  VALUES
    (p_profile_id, v_ws, p_role, lower(p_username),
     extensions.crypt(p_pin, extensions.gen_salt('bf')),
     true, 0, NULL, public.current_profile_id())
  ON CONFLICT (profile_id) DO UPDATE
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
CREATE OR REPLACE FUNCTION public.disable_member_login_code(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.member_login_teacher_workspace(p_profile_id);
  UPDATE public.member_login_codes SET active = false WHERE profile_id = p_profile_id;
END;
$fn$;

-- ------------------------------------------------------------
-- 3) Öğretmen: bir öğrencinin ve velilerinin kod durumu (hash ASLA dönmez)
--
-- Öğrenci sayfası öğrenci kimliğiyle çalışıyor; tek çağrıda öğrenci +
-- bağlı veliler döner. Kodu olmayan veli de listelenir (has_code=false):
-- e-postayla katılmış veliyi öğretmen görsün ama ona PIN üretilmez.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_member_logins(p_student_id UUID)
RETURNS TABLE (
  profile_id UUID,
  role       TEXT,
  full_name  TEXT,
  has_code   BOOLEAN,
  username   TEXT,
  active     BOOLEAN,
  locked     BOOLEAN,
  updated_at TIMESTAMPTZ
)
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
    SELECT p.id, 'student'::TEXT, p.full_name, c.profile_id IS NOT NULL, c.username, c.active,
           (c.locked_until IS NOT NULL AND c.locked_until > NOW()), c.updated_at
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    LEFT JOIN public.member_login_codes c ON c.profile_id = p.id
    WHERE s.id = p_student_id
    UNION ALL
    SELECT p.id, 'parent'::TEXT, p.full_name, c.profile_id IS NOT NULL, c.username, c.active,
           (c.locked_until IS NOT NULL AND c.locked_until > NOW()), c.updated_at
    FROM public.parent_student_links l
    JOIN public.profiles p ON p.id = l.parent_profile_id
    LEFT JOIN public.member_login_codes c ON c.profile_id = p.id
    WHERE l.student_id = p_student_id AND l.workspace_id = v_ws AND l.status = 'active';
END;
$fn$;

-- ------------------------------------------------------------
-- 4) Giriş: PIN doğrula (oturumsuz çağrılır)
--
-- Yalnız TRUE/FALSE döner — kullanıcı adının var olup olmadığını ya da
-- kilitli olduğunu söylemez (numaralandırmaya kapalı). Kilit: 5 hata,
-- 15 dakika.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_member_pin(p_username TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $fn$
DECLARE
  v_row public.member_login_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.member_login_codes
  WHERE username = lower(p_username) FOR UPDATE;

  IF NOT FOUND OR NOT v_row.active THEN
    RETURN FALSE;
  END IF;
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > NOW() THEN
    RETURN FALSE;
  END IF;

  IF v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) THEN
    UPDATE public.member_login_codes
      SET failed_attempts = 0, locked_until = NULL
      WHERE profile_id = v_row.profile_id;
    RETURN TRUE;
  END IF;

  UPDATE public.member_login_codes
    SET failed_attempts = v_row.failed_attempts + 1,
        locked_until = CASE WHEN v_row.failed_attempts + 1 >= 5
                            THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
    WHERE profile_id = v_row.profile_id;
  RETURN FALSE;
END;
$fn$;


-- ------------------------------------------------------------
-- 5) Kendi boş koç alanını kapat
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_own_empty_workspace(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws      public.workspaces%ROWTYPE;
  v_me      UUID := public.current_profile_id();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_ws.owner_profile_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF v_ws.is_library THEN
    RAISE EXCEPTION 'Bu çalışma alanı kapatılamaz.';
  END IF;
  IF v_ws.created_at < NOW() - INTERVAL '14 days' THEN
    RAISE EXCEPTION 'Çalışma alanı 14 günden eski; kapatmak için destekle iletişime geçin.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_members
             WHERE workspace_id = p_workspace_id AND profile_id <> v_me)
     OR EXISTS (SELECT 1 FROM public.students WHERE workspace_id = p_workspace_id)
     OR EXISTS (SELECT 1 FROM public.books WHERE workspace_id = p_workspace_id)
     OR EXISTS (SELECT 1 FROM public.homework_batches WHERE workspace_id = p_workspace_id)
     OR EXISTS (SELECT 1 FROM public.billing_orders WHERE workspace_id = p_workspace_id)
     OR EXISTS (SELECT 1 FROM public.invitations
                WHERE workspace_id = p_workspace_id AND status = 'accepted') THEN
    RAISE EXCEPTION 'Çalışma alanı boş değil; kapatılamaz.';
  END IF;

  -- 136 ile aynı sıra: önce varsayılan alan başka üyeliğe ya da NULL'a.
  UPDATE public.profiles p
     SET default_workspace_id = (
       SELECT m.workspace_id FROM public.workspace_members m
       WHERE m.profile_id = p.id AND m.workspace_id <> p_workspace_id AND m.status = 'active'
       ORDER BY m.created_at LIMIT 1
     )
   WHERE p.default_workspace_id = p_workspace_id;

  DELETE FROM public.student_services WHERE workspace_id = p_workspace_id;
  DELETE FROM public.test_completions WHERE workspace_id = p_workspace_id;
  DELETE FROM public.homework_items WHERE workspace_id = p_workspace_id;
  DELETE FROM public.workspaces WHERE id = p_workspace_id;

  RETURN jsonb_build_object('closed_workspace_id', p_workspace_id);
END;
$fn$;


REVOKE ALL ON FUNCTION public.member_login_teacher_workspace(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_member_login_code(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disable_member_login_code(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_member_logins(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_member_pin(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_own_empty_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_login_code(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_member_login_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_member_logins(UUID) TO authenticated;
-- Giriş ekranı oturumsuz: anon çağırabilir. Kilit veritabanında.
GRANT EXECUTE ON FUNCTION public.verify_member_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_own_empty_workspace(UUID) TO authenticated;


-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $dogrula$
BEGIN
  IF has_table_privilege('anon', 'public.member_login_codes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.member_login_codes', 'SELECT') THEN
    RAISE EXCEPTION '138 DOĞRULAMA: PIN tablosu doğrudan okunabiliyor.';
  END IF;
  IF has_function_privilege('anon', 'public.set_member_login_code(uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '138 DOĞRULAMA: anon PIN yazabiliyor.';
  END IF;
  IF has_function_privilege('authenticated', 'public.member_login_teacher_workspace(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '138 DOĞRULAMA: iç yardımcı istemciye açık.';
  END IF;
  IF has_function_privilege('anon', 'public.close_own_empty_workspace(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '138 DOĞRULAMA: anon alan kapatabiliyor.';
  END IF;
  IF to_regclass('public.student_login_codes') IS NOT NULL THEN
    RAISE EXCEPTION '138 DOĞRULAMA: eski PIN tablosu duruyor.';
  END IF;
  IF extensions.crypt('123456', extensions.crypt('123456', extensions.gen_salt('bf')))
     IS NULL THEN
    RAISE EXCEPTION '138 DOĞRULAMA: pgcrypto erişilemiyor.';
  END IF;
  RAISE NOTICE '138: PIN tablosu kapalı, fonksiyonlar yetkileriyle yerinde.';
END;
$dogrula$;

-- ROLLBACK (eski tabloya geri dönüş için 119 yeniden uygulanır; veli
-- kodları kaybolur):
--   DROP FUNCTION IF EXISTS public.close_own_empty_workspace(UUID);
--   DROP FUNCTION IF EXISTS public.verify_member_pin(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.student_member_logins(UUID);
--   DROP FUNCTION IF EXISTS public.disable_member_login_code(UUID);
--   DROP FUNCTION IF EXISTS public.set_member_login_code(UUID, TEXT, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.member_login_teacher_workspace(UUID);
--   DROP TABLE IF EXISTS public.member_login_codes;
