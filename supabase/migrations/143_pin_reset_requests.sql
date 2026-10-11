-- ============================================================
-- 143 — "PIN'İMİ UNUTTUM" İSTEKLERİ
--
-- Giriş tek ekrana indi (/login): koç e-posta + şifre, öğrenci ve veli
-- öğretmenin verdiği kullanıcı adı + PIN. PIN'ini unutan, giriş
-- ekranından kullanıcı adını yazıp öğretmenine istek gönderir; öğretmen
-- panelinde görür ve "Yeni PIN üret" der. PIN yenilenince (ya da giriş
-- kapatılınca) açık istek KENDİLİĞİNDEN kapanır.
--
-- GÜVENLİK
--   * Tablo doğrudan okunamaz/yazılamaz (member_login_codes ile aynı
--     model). Öğretmen listeyi pending_pin_reset_requests() ile okur;
--     fonksiyon yalnız çağıranın owner/teacher olduğu alanları döndürür.
--   * request_pin_reset oturumsuz çağrılır ve HİÇBİR ŞEY döndürmez:
--     kullanıcı adı var mı, istek zaten açık mı — dışarıdan anlaşılmaz.
--     Hız sınırı uygulamada (app/(auth)/actions.ts); hesap başına en
--     fazla bir açık istek olduğu için tablo şişirilemez.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pin_reset_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

-- Hesap başına tek açık istek.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pin_reset_open
  ON public.pin_reset_requests (profile_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pin_reset_workspace_open
  ON public.pin_reset_requests (workspace_id) WHERE resolved_at IS NULL;

ALTER TABLE public.pin_reset_requests ENABLE ROW LEVEL SECURITY;
-- Bilinçli olarak POLİTİKA YOK: erişim yalnız aşağıdaki fonksiyonlarla.
REVOKE ALL ON public.pin_reset_requests FROM anon, authenticated;


-- ------------------------------------------------------------
-- 1) Giriş ekranı: istek bırak (oturumsuz)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_pin_reset(p_username TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row public.member_login_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.member_login_codes
  WHERE username = lower(trim(p_username)) AND active;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.pin_reset_requests (profile_id, workspace_id)
  VALUES (v_row.profile_id, v_row.workspace_id)
  ON CONFLICT (profile_id) WHERE resolved_at IS NULL DO NOTHING;
END;
$fn$;


-- ------------------------------------------------------------
-- 2) Öğretmen: açık istekler
--
-- Öğrencinin kendisi için student_id doğrudan; veli için alandaki ilk
-- aktif bağlı öğrenci (öğretmen o öğrencinin Veliler sekmesine gider).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pending_pin_reset_requests()
RETURNS TABLE (
  id           UUID,
  profile_id   UUID,
  role         TEXT,
  full_name    TEXT,
  student_id   UUID,
  student_name TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY
    SELECT r.id, r.profile_id, c.role, p.full_name, s.id, s.full_name, r.created_at
    FROM public.pin_reset_requests r
    JOIN public.member_login_codes c ON c.profile_id = r.profile_id
    JOIN public.profiles p ON p.id = r.profile_id
    LEFT JOIN LATERAL (
      SELECT st.id, st.full_name
      FROM public.students st
      WHERE st.workspace_id = r.workspace_id
        AND (
          (c.role = 'student' AND st.profile_id = r.profile_id)
          OR (c.role = 'parent' AND EXISTS (
            SELECT 1 FROM public.parent_student_links l
            WHERE l.student_id = st.id AND l.parent_profile_id = r.profile_id
              AND l.workspace_id = r.workspace_id AND l.status = 'active'
          ))
        )
      ORDER BY st.full_name
      LIMIT 1
    ) s ON true
    WHERE r.resolved_at IS NULL
      AND public.has_workspace_role(r.workspace_id, ARRAY['owner', 'teacher'])
    ORDER BY r.created_at DESC;
END;
$fn$;


-- ------------------------------------------------------------
-- 3) PIN yenilenince / giriş kapatılınca istek kapanır
--
-- 138'deki iki fonksiyon AYNEN, yalnız sonlarına kapanış eklendi.
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

  -- 143: açık "PIN'imi unuttum" isteği karşılandı.
  UPDATE public.pin_reset_requests SET resolved_at = NOW()
  WHERE profile_id = p_profile_id AND resolved_at IS NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.disable_member_login_code(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.member_login_teacher_workspace(p_profile_id);
  UPDATE public.member_login_codes SET active = false WHERE profile_id = p_profile_id;
  -- 143: giriş kapandıysa bekleyen istek anlamsız.
  UPDATE public.pin_reset_requests SET resolved_at = NOW()
  WHERE profile_id = p_profile_id AND resolved_at IS NULL;
END;
$fn$;


REVOKE ALL ON FUNCTION public.request_pin_reset(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pending_pin_reset_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_member_login_code(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disable_member_login_code(UUID) FROM PUBLIC, anon;
-- Giriş ekranı oturumsuz: anon çağırabilir. Hiçbir şey döndürmez.
GRANT EXECUTE ON FUNCTION public.request_pin_reset(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_pin_reset_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_login_code(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_member_login_code(UUID) TO authenticated;


-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $dogrula$
BEGIN
  IF has_table_privilege('anon', 'public.pin_reset_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pin_reset_requests', 'SELECT') THEN
    RAISE EXCEPTION '143 DOĞRULAMA: PIN istek tablosu doğrudan okunabiliyor.';
  END IF;
END;
$dogrula$;
