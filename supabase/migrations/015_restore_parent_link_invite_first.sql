-- ============================================================
-- 015_restore_parent_link_invite_first
--
-- Bug: Davetle kayıt olan veli giriş yaptığında /parent açılmıyor,
-- beyaz ekran gelip sayfa sürekli yenileniyordu (sonsuz yönlendirme).
--
-- Sebep: 006_fix_accept_invitation, parent_student_link_id NULL olan
-- "invite-first" akışı için bağlantıyı OLUŞTURAN bir ELSIF dalı
-- eklemişti. 008_invite_email_binding, accept_invitation'ı e-posta
-- doğrulaması eklemek için baştan yazarken bu dalı düşürdü ve yalnızca
-- "mevcut placeholder bağlantıyı güncelle" durumunu korudu.
--
-- createInviteAction (app/(dashboard)/teacher/students/[studentId]/
-- invite-actions.ts) her zaman parent_student_link_id = NULL gönderdiği
-- için veli bağlantısı hiç oluşmuyordu. Sonuç: velinin 0 aktif bağlantısı
-- oluyor, getParentContext /login'e yönlendiriyor, middleware girişli
-- kullanıcıyı /'a, / da rolü veli görüp /parent'a geri gönderiyordu.
--
-- Bu migration 008'in gövdesini korur (e-posta doğrulaması dahil) ve
-- yalnızca 006'daki veli bağlantısı dalını geri getirir.
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

  -- Security (C1, 008): if the invite targets a specific email, the
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

  -- Handle parent link (006'dan geri getirildi)
  IF v_role = 'parent' THEN
    IF v_inv.parent_student_link_id IS NOT NULL THEN
      -- Mevcut placeholder bağlantıyı aktifleştir
      UPDATE public.parent_student_links
      SET parent_profile_id = v_profile_id, status = 'active'
      WHERE id = v_inv.parent_student_link_id;
    ELSIF v_inv.student_id IS NOT NULL THEN
      -- Invite-first akışı: bağlantıyı burada oluştur
      INSERT INTO public.parent_student_links (workspace_id, parent_profile_id, student_id, status)
      VALUES (v_inv.workspace_id, v_profile_id, v_inv.student_id, 'active')
      ON CONFLICT (workspace_id, parent_profile_id, student_id) DO UPDATE
        SET status = 'active';
    END IF;
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

-- ------------------------------------------------------------
-- Geriye dönük onarım: bu hata yüzünden bağlantısı oluşmamış,
-- daveti kabul edilmiş velilerin kaydını tamamla.
--
-- DISTINCT şart: aynı veli/öğrenci çifti için birden fazla kabul
-- edilmiş davet olabilir (davet tekrar gönderilmişse). Tekilleştirme
-- olmadan tek INSERT aynı satırı iki kez güncellemeye çalışır ve
-- "ON CONFLICT DO UPDATE command cannot affect row a second time"
-- hatası verir.
-- ------------------------------------------------------------
INSERT INTO public.parent_student_links (workspace_id, parent_profile_id, student_id, status)
SELECT DISTINCT i.workspace_id, i.accepted_by_profile_id, i.student_id, 'active'
FROM public.invitations i
WHERE i.role = 'parent'
  AND i.status = 'accepted'
  AND i.accepted_by_profile_id IS NOT NULL
  AND i.student_id IS NOT NULL
  AND i.parent_student_link_id IS NULL
ON CONFLICT (workspace_id, parent_profile_id, student_id) DO UPDATE
  SET status = 'active';
