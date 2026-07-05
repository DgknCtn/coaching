-- ============================================================
-- 008_invite_email_binding
-- Security fix (C1): bind invite acceptance to the invited email.
--
-- Previously accept_invitation trusted whatever email the client
-- supplied and set students.profile_id to the redeemer. A leaked/
-- forwarded invite link (unguessable token, but shareable) let an
-- arbitrary account fully take over the invited student's identity.
--
-- This migration replaces accept_invitation, adding a check that,
-- when invitations.invited_email is set, the redeeming account's
-- email must match it (case-insensitive). Body is otherwise
-- identical to 005_rpc_functions.sql.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token_hash  TEXT,
  p_auth_user_id UUID,
  p_full_name    TEXT,
  p_email        TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv             public.invitations%ROWTYPE;
  v_profile_id      UUID;
  v_role            TEXT;
BEGIN
  -- Fetch and validate invitation
  SELECT * INTO v_inv FROM public.invitations
  WHERE token_hash = p_token_hash AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used invitation';
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Security (C1): if the invite targets a specific email, the
  -- redeeming account must use that same email.
  IF v_inv.invited_email IS NOT NULL
     AND lower(p_email) <> lower(v_inv.invited_email) THEN
    RAISE EXCEPTION 'This invitation was issued for a different email address';
  END IF;

  -- Upsert profile
  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (p_auth_user_id, p_full_name, p_email)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        updated_at = NOW()
  RETURNING id INTO v_profile_id;

  v_role := v_inv.role;

  -- Link student profile if role = student
  IF v_role = 'student' AND v_inv.student_id IS NOT NULL THEN
    UPDATE public.students SET profile_id = v_profile_id WHERE id = v_inv.student_id;
  END IF;

  -- Activate parent link if role = parent
  IF v_role = 'parent' AND v_inv.parent_student_link_id IS NOT NULL THEN
    UPDATE public.parent_student_links
    SET parent_profile_id = v_profile_id, status = 'active'
    WHERE id = v_inv.parent_student_link_id;
  END IF;

  -- Add workspace member
  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_inv.workspace_id, v_profile_id, v_role, 'active')
  ON CONFLICT (workspace_id, profile_id, role) DO UPDATE
    SET status = 'active', updated_at = NOW();

  -- Set default workspace
  UPDATE public.profiles
  SET default_workspace_id = v_inv.workspace_id
  WHERE id = v_profile_id AND default_workspace_id IS NULL;

  -- Mark invitation accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW(), accepted_by_profile_id = v_profile_id
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'profile_id',    v_profile_id,
    'workspace_id',  v_inv.workspace_id,
    'role',          v_role
  );
END;
$$;
