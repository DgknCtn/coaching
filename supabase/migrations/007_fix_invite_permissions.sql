-- ============================================================
-- 007_fix_invite_permissions.sql
-- Davet akışı için 2 kritik düzeltme:
-- 1. get_invitation_by_token: anonim kullanıcı davet detayını görebilsin
-- 2. accept_invitation GRANT: anonim çağırabilsin
-- ============================================================

-- Davet detayını token_hash ile döndüren public RPC.
-- SECURITY DEFINER → RLS bypass, anon kullanıcı çağırabilir.
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token_hash TEXT)
RETURNS TABLE (
  id                uuid,
  role              text,
  status            text,
  expires_at        timestamptz,
  invited_email     text,
  student_id        uuid,
  student_full_name text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.role::text,
    i.status::text,
    i.expires_at,
    i.invited_email,
    i.student_id,
    s.full_name AS student_full_name
  FROM public.invitations i
  LEFT JOIN public.students s ON s.id = i.student_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
END;
$$;

-- Anonim ve oturum açmış kullanıcılar çağırabilsin
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid, text, text)
  TO anon, authenticated;
