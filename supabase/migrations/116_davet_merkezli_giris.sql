-- ============================================================
-- 116 — DAVET MERKEZLİ GİRİŞ
--
-- ============================================================
-- NEDEN
--
-- Google girişi açılınca iki kırık yol görünür oldu:
--
--   1. Davet linkini açmadan /login'den Google ile giren öğrenci ya da
--      veli, çalışma alanı olmadığı için OTOMATİK ÖĞRETMEN yapılıyordu
--      (app/page.tsx geç kurulumu). Sonra davetini de kabul edemiyordu.
--   2. Bir öğrenciye aynı anda yalnız TEK bekleyen veli daveti olabiliyordu
--      (045). Anneye link verilince babanınki iptal oluyordu.
--
-- Uygulama artık davetsiz yeni kullanıcıyı /hosgeldin'e gönderiyor. Orada
-- önce kullanıcının e-postasına kesilmiş bekleyen davetler listeleniyor
-- ve tek tıkla kabul ediliyor. Bu dosya o ekranın iki RPC'sini ve veli
-- davetlerinin tekillik kuralını getiriyor.
--
-- ============================================================
-- KABUL KURALI TEK YERDE
--
-- `accept_invitation_by_id` kendi kabul mantığını YAZMAZ: daveti bulup
-- 024'teki `accept_invitation`'ı çağırır. E-posta bağı, süre, tek
-- kullanım, profil/üyelik/veli bağı yazımı tek fonksiyonda kalır; iki
-- giriş noktası ayrışamaz.
--
-- HIZ SINIRI YOK VE BU BİLİNÇLİ: ID ile kabul YALNIZ oturumdaki e-postaya
-- kesilmiş davetlerde çalışıyor. Başkasının davet kimliğini tahmin etmek
-- hiçbir şey kazandırmaz — e-posta bağı zaten reddeder. E-postasız veli
-- davetleri (bağsız linkler) bu yoldan HİÇ kabul edilemez; onlar yalnız
-- linkteki token ile.
-- ============================================================


-- ------------------------------------------------------------
-- 1) my_pending_invitations — bana kesilmiş bekleyen davetler
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_pending_invitations()
RETURNS TABLE (
  invitation_id   UUID,
  role            TEXT,
  student_name    TEXT,
  workspace_name  TEXT,
  expires_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    i.id,
    i.role,
    s.full_name,
    w.name,
    i.expires_at
  FROM public.invitations i
  JOIN public.workspaces w ON w.id = i.workspace_id
  LEFT JOIN public.students s ON s.id = i.student_id
  -- Oturumsuz çağrı: anon'a zaten kapalı; e-posta boş olduğu için
  -- aşağıdaki eşleşme de hiçbir satır döndürmez.
  WHERE i.status = 'pending'
    AND i.expires_at > NOW()
    AND i.role IN ('student', 'parent')
    AND i.invited_email IS NOT NULL
    AND lower(i.invited_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  ORDER BY i.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.my_pending_invitations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_pending_invitations() FROM anon;
GRANT  EXECUTE ON FUNCTION public.my_pending_invitations() TO authenticated;


-- ------------------------------------------------------------
-- 2) accept_invitation_by_id — listeden tek tıkla kabul
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation_by_id(
  p_invitation_id UUID,
  p_full_name     TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_token_hash     TEXT;
  v_email          TEXT;
  -- Oturumun kimliği. Oturumsuz çağrıyı accept_invitation reddeder
  -- ('Permission denied'); burada ayrıca denetlemek kuralı ikiye bölerdi.
  v_auth_user_id   UUID := auth.uid();
BEGIN
  SELECT token_hash, invited_email INTO v_token_hash, v_email
  FROM public.invitations
  WHERE id = p_invitation_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used invitation';
  END IF;

  -- Bağsız (e-postasız) davet ID ile KABUL EDİLEMEZ: linke sahip olmayan
  -- biri kimliği tahmin ederek veli olamaz.
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'This invitation can only be accepted with its link';
  END IF;

  -- Asıl doğrulama ve yazma 024'te: e-posta bağı, süre, tek kullanım.
  RETURN public.accept_invitation(
    v_token_hash,
    v_auth_user_id,
    p_full_name,
    COALESCE(auth.jwt() ->> 'email', '')
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.accept_invitation_by_id(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_invitation_by_id(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.accept_invitation_by_id(UUID, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- 3) Veliye birden fazla bekleyen davet
--
-- 045 "öğrenci başına rol başına tek bekleyen davet" diyordu; veli için bu,
-- anne ile babanın aynı anda davet edilememesi demekti. Kural artık:
--   - öğrenci daveti : öğrenci başına tek (yenisi eskisini iptal eder)
--   - veli daveti    : aynı e-postaya çift davet yok; e-postasızlar serbest
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.uniq_invitation_pending_per_student_role;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invitation_pending_student
  ON public.invitations (student_id)
  WHERE status = 'pending' AND role = 'student' AND student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invitation_pending_parent_email
  ON public.invitations (student_id, lower(invited_email))
  WHERE status = 'pending' AND role = 'parent'
    AND student_id IS NOT NULL AND invited_email IS NOT NULL;


-- ------------------------------------------------------------
-- 4) Doğrulama
-- ------------------------------------------------------------
DO $dogrula$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['my_pending_invitations()', 'accept_invitation_by_id(uuid,text)'] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = ('public.' || v_fn)::regprocedure) THEN
      RAISE EXCEPTION '116 DOĞRULAMA: % SECURITY DEFINER değil.', v_fn;
    END IF;
    IF has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '116 DOĞRULAMA: % anon''a açık.', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', ('public.' || v_fn)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '116 DOĞRULAMA: % authenticated''a kapalı.', v_fn;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_invitation_pending_per_student_role') THEN
    RAISE EXCEPTION '116 DOĞRULAMA: eski tekillik index''i duruyor.';
  END IF;

  RAISE NOTICE '116: iki RPC yetkileriyle yerinde, veli davet kuralı güncel.';
END;
$dogrula$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.accept_invitation_by_id(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.my_pending_invitations();
--   DROP INDEX IF EXISTS public.uniq_invitation_pending_student;
--   DROP INDEX IF EXISTS public.uniq_invitation_pending_parent_email;
--   -- 045'teki index geri kurulmadan önce bir öğrencide birden fazla
--   -- bekleyen veli daveti varsa fazlası 'revoked' yapılmalı.
--   CREATE UNIQUE INDEX uniq_invitation_pending_per_student_role
--     ON public.invitations (student_id, role)
--     WHERE status = 'pending' AND student_id IS NOT NULL;
-- ============================================================
