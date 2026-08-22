-- ============================================================
-- 024_security_hardening
--
-- Uçtan uca güvenlik denetiminde DOĞRULANAN dört bulgu kapatılır.
-- Hiçbir ekranın veya akışın davranışı değişmez: buradaki kontroller
-- yalnızca meşru uygulamanın zaten sağladığı koşulları zorunlu kılar,
-- kötü niyetli/doğrudan PostgREST çağrılarını reddeder.
--
-- A1  create_teacher_workspace  — kimlik istemciden geliyordu
-- A2  accept_invitation         — e-posta bağlaması atlatılabiliyordu
-- A3  SECURITY DEFINER          — hiçbirinde SET search_path yoktu
-- A4  İki RLS politikası        — atamanın workspace'ini doğrulamıyordu
--
-- NOT (E-posta onayı): Bu projede Supabase e-posta onayı KAPALI, yani
-- signUp anında oturum açılıyor. Hem kayıt (app/(auth)/actions.ts) hem
-- davet kabul (app/invite/[token]/actions.ts) akışı RPC'yi çağırmadan
-- ÖNCE oturum kuruyor; bu yüzden auth.uid() zorunluluğu meşru akışları
-- kırmaz. Onay ileride açılırsa bu iki fonksiyon gözden geçirilmelidir.
-- ============================================================

-- ============================================================
-- A1) create_teacher_workspace — çağıranın kimliğine bağla
--
-- Eskiden: yetki kontrolü yoktu, p_auth_user_id istemciden geliyordu ve
-- ON CONFLICT (auth_user_id) DO UPDATE mevcut profilin adını/e-postasını
-- eziyordu; ardından default_workspace_id saldırganın workspace'ine
-- çevriliyordu. Kurban bir sonraki girişinde (lib/workspace.ts) bu
-- workspace'i okuduğu için kendi verisine erişemez hale geliyordu.
-- GRANT ifadesi olmadığı için EXECUTE Postgres varsayılanıyla PUBLIC'teydi.
--
-- Gövde 005'teki haliyle AYNEN korunur; yalnızca başına kimlik kontrolü
-- eklenir ve EXECUTE yetkisi daraltılır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_teacher_workspace(
  p_auth_user_id  UUID,
  p_full_name     TEXT,
  p_email         TEXT,
  p_workspace_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id    UUID;
  v_workspace_id  UUID;
  v_ws_name       TEXT;
BEGIN
  -- Kimlik istemciye emanet edilemez: yalnızca oturum sahibi kendi
  -- profilini oluşturabilir.
  IF auth.uid() IS NULL OR auth.uid() <> p_auth_user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Upsert profile
  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (p_auth_user_id, p_full_name, p_email)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        updated_at = NOW()
  RETURNING id INTO v_profile_id;

  v_ws_name := COALESCE(NULLIF(p_workspace_name, ''), p_full_name || ' Workspace');

  -- Create workspace
  INSERT INTO public.workspaces (name, type, owner_profile_id)
  VALUES (v_ws_name, 'individual', v_profile_id)
  RETURNING id INTO v_workspace_id;

  -- Add as owner
  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'owner', 'active');

  -- Add as teacher too (same person)
  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'teacher', 'active');

  -- Set default workspace
  UPDATE public.profiles
  SET default_workspace_id = v_workspace_id
  WHERE id = v_profile_id;

  RETURN jsonb_build_object(
    'profile_id',   v_profile_id,
    'workspace_id', v_workspace_id
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- A2) accept_invitation — kimliği ve e-postayı JWT'den doğrula
--
-- Eskiden: 008'in eklediği e-posta kontrolü, İSTEMCİNİN gönderdiği
-- p_email ile yapılıyordu; p_auth_user_id de doğrulanmıyordu ve fonksiyon
-- 007 ile anon'a GRANT edilmişti. Daveti ele geçiren biri sunucu
-- action'ını atlayıp {p_auth_user_id: kendi uid'si, p_email: davetli
-- e-posta} ile çağırarak öğrenci kaydını kendi hesabına bağlayabiliyordu —
-- yani 008'in kapatmayı amaçladığı devralma senaryosu açık kalmıştı.
--
-- Gövde 015'teki haliyle AYNEN korunur (veli bağlantısı dalları dahil);
-- yalnızca kimlik/e-posta kaynağı istemciden JWT'ye taşınır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token_hash  TEXT,
  p_auth_user_id UUID,
  p_full_name    TEXT,
  p_email        TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_inv             public.invitations%ROWTYPE;
  v_profile_id      UUID;
  v_role            TEXT;
  v_session_email   TEXT;
BEGIN
  -- Kimlik istemciye emanet edilemez: daveti yalnızca oturum sahibi
  -- kendi hesabına bağlayabilir.
  IF auth.uid() IS NULL OR auth.uid() <> p_auth_user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_session_email := auth.jwt() ->> 'email';

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

  -- Security (C1, 008 → 024): davet belirli bir e-postaya kesildiyse,
  -- kabul eden hesabın GERÇEK e-postası (JWT'den) o olmalı. Karşılaştırma
  -- artık istemcinin gönderdiği p_email ile yapılmıyor.
  IF v_inv.invited_email IS NOT NULL
     AND lower(COALESCE(v_session_email, '')) <> lower(v_inv.invited_email) THEN
    RAISE EXCEPTION 'This invitation was issued for a different email address';
  END IF;

  -- Upsert profile. E-posta oturumun kendisinden alınır; p_email yalnızca
  -- JWT e-postası okunamazsa yedek olarak kullanılır.
  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (p_auth_user_id, p_full_name, COALESCE(v_session_email, p_email))
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

  -- Handle parent link (006'dan geri getirildi, 015)
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
$fn$;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(TEXT, UUID, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.accept_invitation(TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- A2b) get_invitation_by_token — BİLİNÇLİ OLARAK DEĞİŞTİRİLMEDİ
--
-- Denetimde "süresi geçmiş/kullanılmış davetlerde de PII (e-posta +
-- öğrenci adı) döndürüyor" diye işaretlenmişti (düşük ciddiyet). Ancak
-- app/invite/[token]/page.tsx:49 dönen `status` alanına bakıp "Bu davet
-- zaten kullanıldı" / "Süresi doldu" mesajlarını ayırt ediyor. Filtre
-- eklemek bu ekranları "Davet bulunamadı"ya çevirirdi — yani görünür bir
-- davranış değişikliği olurdu ve bu paketin kabul kriterini ihlal ederdi.
--
-- Risk zaten sınırlı: token 256 bit entropiye sahip ve DB'de yalnız
-- SHA-256 hash'i duruyor (lib/invite.ts), dolayısıyla tahmin edilemez.
-- Fonksiyon anon'da kalır; aşağıdaki A3 döngüsü ona da search_path ekler.
-- ============================================================

-- ============================================================
-- A3) Tüm SECURITY DEFINER fonksiyonlarına search_path sabitle
--
-- Depoda 52 SECURITY DEFINER tanımı vardı ve HİÇBİRİNDE SET search_path
-- yoktu — RLS'in dayandığı has_workspace_role / current_profile_id /
-- is_student_self dahil. public şemasında CREATE hakkı olan bir kullanıcı
-- bir yardımcı fonksiyonu gölgeleyip tanımlayıcının (postgres) yetkisiyle
-- kod çalıştırabilir; has_workspace_role gölgelenirse tüm izolasyon
-- modeli çöker.
--
-- Gövdeleri yeniden yazmak yerine ALTER FUNCTION kullanılır: yalnızca
-- fonksiyonun yapılandırması değişir, mantığı hiç ellenmez. Döngü
-- idempotenttir — ikinci çalıştırmada dokunacak fonksiyon kalmaz
-- (proconfig artık dolu).
-- ============================================================
DO $harden$
DECLARE
  r        RECORD;
  v_count  INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                    -- SECURITY DEFINER
      AND (p.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(p.proconfig) AS c
            WHERE c LIKE 'search\_path=%'
          ))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.signature);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '024: % SECURITY DEFINER fonksiyonuna search_path sabitlendi.', v_count;
END;
$harden$;

-- ============================================================
-- A4) RLS: atamanın workspace'ini de doğrula
--
-- 022 ve 023'teki INSERT/DELETE politikaları yalnız satırın kendi
-- workspace_id kolonuna bakıyordu; student_book_assignment_id'nin O
-- workspace'e ait olduğu kontrol edilmiyordu. A workspace'inin öğretmeni
-- doğrudan PostgREST ile {workspace_id: A, student_book_assignment_id:
-- B'nin ataması} yazabilirdi. student_book_targets'ta atama başına tek
-- aktif hedef (uniq_active_student_book_target) olduğu için bu, başka
-- workspace'in hedef kaydını bloke etmeye kadar gider.
--
-- Uygulamanın kendi yolu (set_student_book_target RPC / öğrenci "İzledim"
-- akışı) zaten doğru workspace'i yazdığı için UI etkilenmez.
-- ============================================================
DROP POLICY IF EXISTS student_book_targets_insert ON public.student_book_targets;
CREATE POLICY student_book_targets_insert ON public.student_book_targets
  FOR INSERT WITH CHECK (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])
    AND EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = student_book_targets.student_book_assignment_id
        AND sba.workspace_id = student_book_targets.workspace_id
    )
  );

DROP POLICY IF EXISTS video_watch_marks_insert ON public.video_watch_marks;
CREATE POLICY video_watch_marks_insert ON public.video_watch_marks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = video_watch_marks.student_book_assignment_id
        AND sba.workspace_id = video_watch_marks.workspace_id
        AND (
          public.has_workspace_role(video_watch_marks.workspace_id, ARRAY['owner', 'teacher'])
          OR public.is_student_self(sba.student_id)
        )
    )
  );

DROP POLICY IF EXISTS video_watch_marks_delete ON public.video_watch_marks;
CREATE POLICY video_watch_marks_delete ON public.video_watch_marks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = video_watch_marks.student_book_assignment_id
        AND sba.workspace_id = video_watch_marks.workspace_id
        AND (
          public.has_workspace_role(video_watch_marks.workspace_id, ARRAY['owner', 'teacher'])
          OR public.is_student_self(sba.student_id)
        )
    )
  );
