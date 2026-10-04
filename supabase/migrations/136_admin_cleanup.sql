-- ============================================================
-- 136 — YÖNETİM PANELİ: TEST VERİSİNİ SEÇEREK TEMİZLEME
--
-- 128 "silme kapsamı tanımlanana kadar buton yok" demişti. Kapsam:
--
--   ÇALIŞMA ALANI — her şeyiyle silinir (tenant tabloları CASCADE).
--     ENGEL: kütüphane alanı; ödenmiş sipariş (billing_orders.status
--     = 'paid') ya da ödenmiş komisyon. Gerçek parası geçmiş alan
--     silinmez, askıya alınır (fatura/vergi izi).
--   PARTNER — silinir; bekleyen komisyonları CASCADE, yönlendirdiği
--     alanlarda referred_by_partner_id SET NULL (059).
--     ENGEL: ödenmiş komisyon.
--   KULLANICI — auth.users satırı silinir; profiles CASCADE (001:14),
--     üyelikler ve veli bağları CASCADE.
--     ENGEL: platform yöneticisi ya da kendi hesabı; sahip olduğu bir
--     çalışma alanı; ON DELETE kuralı olmayan herhangi bir FK ile hâlâ
--     ona bağlı satır (ör. başka bir alanda verdiği ödev). Engeller
--     pg_constraint'ten DİNAMİK bulunur: bir sonraki migration yeni bir
--     *_by_profile_id sütunu eklerse liste kendiliğinden güncel kalır.
--
-- MAHREMİYET (060/124, kullanıcı kararı 27.09.2026 — öğrenci ve veli
-- yalnız sayı): bir çalışma alanında hâlâ YALNIZ öğrenci/veli olan
-- hesabın adı dönmez, e-postası maskelenir (d***@gmail.com). Onay
-- metni de o maskeli e-postadır. Öğretmen, partner ve hiçbir alana üye
-- olmayan (artık hiçbir öğretmene bağlı olmayan) hesap adıyla görünür.
--
-- ÖĞRENCİ İÇİN YÖNETİM ARACI YOK: test alanının öğrencileri alanla
-- gider; gerçek bir alandaki tek test öğrencisi öğretmenin arşiv →
-- kalıcı sil akışıyla (134) temizlenir. Panel öğrenci adı göstermez.
--
-- HER SİLME (128 şablonu): is_platform_admin() → require_admin_reason →
-- ad/e-posta birebir onayı → FOR UPDATE → record_admin_action (SİLMEDEN
-- ÖNCE; admin_actions FK taşımadığı ve alan adını kopyaladığı için satır
-- silmeden sonra da kalır) → silme. Tek transaction.
--
-- auth.users ÜZERİNDE DELETE: postgres rolünün yetkisi canlıda
-- doğrulandı (relacl: postgres=ar*wdDxtm); fonksiyonlar postgres'e ait.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu. Silinen veri geri gelmez.
-- ============================================================

-- ------------------------------------------------------------
-- İç yardımcılar (istemciye kapalı)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_workspace_facts(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws    public.workspaces%ROWTYPE;
  v_paid_orders INT;
  v_paid_comm   INT;
  v_reason TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_paid_orders
  FROM public.billing_orders WHERE workspace_id = p_workspace_id AND status = 'paid';
  SELECT COUNT(*) INTO v_paid_comm
  FROM public.partner_commissions WHERE workspace_id = p_workspace_id AND status = 'paid';

  v_reason := CASE
    WHEN v_ws.is_library THEN 'Kütüphane çalışma alanı silinemez.'
    WHEN v_paid_orders > 0 THEN 'Ödenmiş siparişi var; silinemez, askıya alın.'
    WHEN v_paid_comm > 0 THEN 'Ödenmiş partner komisyonu var; silinemez, askıya alın.'
  END;

  RETURN jsonb_build_object(
    'id', v_ws.id,
    'name', v_ws.name,
    'status', v_ws.status,
    'plan', v_ws.plan,
    'created_at', v_ws.created_at,
    'owner_name', (SELECT full_name FROM public.profiles WHERE id = v_ws.owner_profile_id),
    'owner_email', (SELECT email FROM public.profiles WHERE id = v_ws.owner_profile_id),
    'students', (SELECT COUNT(*) FROM public.students WHERE workspace_id = p_workspace_id),
    'books', (SELECT COUNT(*) FROM public.books WHERE workspace_id = p_workspace_id),
    'homework_batches', (SELECT COUNT(*) FROM public.homework_batches WHERE workspace_id = p_workspace_id),
    'members', (SELECT COUNT(*) FROM public.workspace_members WHERE workspace_id = p_workspace_id),
    'orders', (SELECT COUNT(*) FROM public.billing_orders WHERE workspace_id = p_workspace_id),
    'paid_orders', v_paid_orders,
    'paid_commissions', v_paid_comm,
    'blocked', v_reason IS NOT NULL,
    'block_reason', v_reason
  );
END;
$fn$;

-- Profili ON DELETE kuralı olmadan (NO ACTION / RESTRICT) referanslayan
-- satırlar: { "tablo.sütun": adet }. Boşsa kullanıcı silinebilir.
CREATE OR REPLACE FUNCTION public.admin_profile_blockers(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r     RECORD;
  v_n   BIGINT;
  v_out JSONB := '{}'::JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
      AND c.confdeltype IN ('a', 'r')
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %s WHERE %I = $1', r.tbl, r.col)
      INTO v_n USING p_profile_id;
    IF v_n > 0 THEN
      v_out := v_out || jsonb_build_object(r.tbl::TEXT || '.' || r.col, v_n);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$fn$;

-- Hesap bir alanda YALNIZ öğrenci/veli mi? (mahremiyet kuralı)
CREATE OR REPLACE FUNCTION public.cleanup_is_learner_account(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
           SELECT 1 FROM public.workspace_members
           WHERE profile_id = p_profile_id AND role IN ('student', 'parent')
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.workspace_members
           WHERE profile_id = p_profile_id AND role IN ('owner', 'teacher', 'assistant')
         )
     AND NOT EXISTS (SELECT 1 FROM public.partners WHERE profile_id = p_profile_id);
$fn$;

-- "dogukan@gmail.com" -> "d***@gmail.com"
CREATE OR REPLACE FUNCTION public.cleanup_mask_email(p_email TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
    WHEN p_email IS NULL OR position('@' IN p_email) < 2 THEN p_email
    ELSE left(p_email, 1) || '***' || substr(p_email, position('@' IN p_email))
  END;
$fn$;

REVOKE ALL ON FUNCTION public.cleanup_is_learner_account(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_mask_email(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_workspace_facts(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_profile_blockers(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Önizleme (salt okunur)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_cleanup_preview(p_kind TEXT, p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_out      JSONB;
  v_partner  public.partners%ROWTYPE;
  v_profile  public.profiles%ROWTYPE;
  v_email    TEXT;
  v_blockers JSONB;
  v_reason   TEXT;
  v_learner  BOOLEAN;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_kind = 'workspace' THEN
    v_out := public.admin_workspace_facts(p_id);
    IF v_out IS NULL THEN RAISE EXCEPTION 'Çalışma alanı bulunamadı.'; END IF;
    RETURN v_out;

  ELSIF p_kind = 'partner' THEN
    SELECT * INTO v_partner FROM public.partners WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Partner bulunamadı.'; END IF;
    v_out := jsonb_build_object(
      'id', v_partner.id,
      'name', v_partner.name,
      'referred_workspaces', (SELECT COUNT(*) FROM public.workspaces WHERE referred_by_partner_id = p_id),
      'commissions', (SELECT COUNT(*) FROM public.partner_commissions WHERE partner_id = p_id),
      'paid_commissions', (SELECT COUNT(*) FROM public.partner_commissions WHERE partner_id = p_id AND status = 'paid')
    );
    RETURN v_out || jsonb_build_object(
      'blocked', (v_out->>'paid_commissions')::INT > 0,
      'block_reason', CASE WHEN (v_out->>'paid_commissions')::INT > 0
                           THEN 'Ödenmiş komisyonu var; silinemez, askıya alın.' END
    );

  ELSIF p_kind = 'user' THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;
    SELECT email INTO v_email FROM auth.users WHERE id = v_profile.auth_user_id;
    v_email := COALESCE(v_email, v_profile.email);
    v_learner := public.cleanup_is_learner_account(p_id);
    v_blockers := public.admin_profile_blockers(p_id);

    v_reason := CASE
      WHEN COALESCE(v_profile.is_platform_admin, FALSE) THEN 'Platform yöneticisi silinemez.'
      WHEN p_id = public.current_profile_id() THEN 'Kendi hesabınızı silemezsiniz.'
      WHEN EXISTS (SELECT 1 FROM public.workspaces WHERE owner_profile_id = p_id)
        THEN 'Sahibi olduğu çalışma alanları var; önce onları silin.'
      WHEN v_blockers <> '{}'::JSONB
        THEN 'Başka çalışma alanlarında bu kullanıcıya bağlı kayıtlar var.'
    END;

    RETURN jsonb_build_object(
      'id', v_profile.id,
      'name', CASE WHEN v_learner THEN NULL ELSE v_profile.full_name END,
      'email', CASE WHEN v_learner THEN public.cleanup_mask_email(v_email) ELSE v_email END,
      'learner', v_learner,
      'owned_workspaces', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) ORDER BY w.name)
        FROM public.workspaces w WHERE w.owner_profile_id = p_id
      ), '[]'::JSONB),
      'memberships', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('workspace', w.name, 'role', m.role) ORDER BY w.name)
        FROM public.workspace_members m
        JOIN public.workspaces w ON w.id = m.workspace_id
        WHERE m.profile_id = p_id
      ), '[]'::JSONB),
      'blockers', v_blockers,
      'blocked', v_reason IS NOT NULL,
      'block_reason', v_reason
    );
  END IF;

  RAISE EXCEPTION 'Geçersiz tür.';
END;
$fn$;

-- ------------------------------------------------------------
-- Çalışma alanını sil
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_workspace(
  p_workspace_id UUID, p_confirm_name TEXT, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws    public.workspaces%ROWTYPE;
  v_facts JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Çalışma alanı bulunamadı.';
  END IF;
  IF btrim(COALESCE(p_confirm_name, '')) <> btrim(v_ws.name) THEN
    RAISE EXCEPTION 'Onay için çalışma alanının adını birebir yazın.';
  END IF;

  v_facts := public.admin_workspace_facts(p_workspace_id);
  IF (v_facts->>'blocked')::BOOLEAN THEN
    RAISE EXCEPTION '%', v_facts->>'block_reason';
  END IF;

  -- Kayıt ÖNCE: record_admin_action alan adını workspaces'ten okuyor.
  PERFORM public.record_admin_action(
    'workspace.delete', p_workspace_id, NULL, p_reason, v_facts, '{}'::JSONB
  );

  -- Varsayılan alan başka bir üyeliğe taşınır; yoksa NULL (kurulum
  -- dalı). Silmeden önce: NULL penceresi açılmasın (temizlik betiği).
  UPDATE public.profiles p
     SET default_workspace_id = (
       SELECT m.workspace_id FROM public.workspace_members m
       WHERE m.profile_id = p.id AND m.workspace_id <> p_workspace_id AND m.status = 'active'
       ORDER BY m.created_at LIMIT 1
     )
   WHERE p.default_workspace_id = p_workspace_id;

  -- student_services.group_id → student_groups RESTRICT (074:112) ANINDA
  -- denetlenir; CASCADE sırasına bırakılmaz.
  DELETE FROM public.student_services WHERE workspace_id = p_workspace_id;
  -- 134'teki sıra: kural tanımsız FK'lar açıkça çözülür.
  DELETE FROM public.test_completions WHERE workspace_id = p_workspace_id;
  DELETE FROM public.homework_items WHERE workspace_id = p_workspace_id;
  DELETE FROM public.homework_batches WHERE workspace_id = p_workspace_id;

  DELETE FROM public.workspaces WHERE id = p_workspace_id;

  RETURN jsonb_build_object('deleted_workspace_id', p_workspace_id);
END;
$fn$;

-- ------------------------------------------------------------
-- Partneri sil
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_partner(
  p_partner_id UUID, p_confirm_name TEXT, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_preview JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);

  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner bulunamadı.';
  END IF;
  IF btrim(COALESCE(p_confirm_name, '')) <> btrim(v_partner.name) THEN
    RAISE EXCEPTION 'Onay için partnerin adını birebir yazın.';
  END IF;

  v_preview := public.admin_cleanup_preview('partner', p_partner_id);
  IF (v_preview->>'blocked')::BOOLEAN THEN
    RAISE EXCEPTION '%', v_preview->>'block_reason';
  END IF;

  PERFORM public.record_admin_action(
    'partner.delete', NULL, p_partner_id, p_reason, v_preview, '{}'::JSONB
  );

  DELETE FROM public.partners WHERE id = p_partner_id;

  RETURN jsonb_build_object('deleted_partner_id', p_partner_id);
END;
$fn$;

-- ------------------------------------------------------------
-- Kullanıcıyı sil
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_profile_id UUID, p_confirm_email TEXT, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_preview JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;

  v_preview := public.admin_cleanup_preview('user', p_profile_id);
  IF lower(btrim(COALESCE(p_confirm_email, ''))) <> lower(btrim(COALESCE(v_preview->>'email', ''))) THEN
    RAISE EXCEPTION 'Onay için kullanıcının e-postasını birebir yazın.';
  END IF;
  IF (v_preview->>'blocked')::BOOLEAN THEN
    RAISE EXCEPTION '%', v_preview->>'block_reason';
  END IF;

  PERFORM public.record_admin_action(
    'user.delete', NULL, p_profile_id, p_reason,
    v_preview - 'blockers' - 'blocked' - 'block_reason', '{}'::JSONB
  );

  -- profiles CASCADE (001:14); üyelikler, veli bağları CASCADE;
  -- diğer *_profile_id sütunları SET NULL.
  DELETE FROM auth.users WHERE id = v_profile.auth_user_id;

  RETURN jsonb_build_object('deleted_profile_id', p_profile_id);
END;
$fn$;

-- ------------------------------------------------------------
-- Kullanıcı listesi (silme için arama)
-- Yalnız kimlik ve rol; akademik veri yok.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100
)
RETURNS TABLE (
  profile_id UUID, full_name TEXT, email TEXT, roles TEXT[],
  owned_workspaces BIGINT, is_platform_admin BOOLEAN, is_partner BOOLEAN,
  created_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_q TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Mahremiyet: yalnız öğrenci/veli olan hesapta ad NULL, e-posta maskeli.
  RETURN QUERY
  SELECT p.id,
         CASE WHEN l.learner THEN NULL ELSE p.full_name END,
         CASE WHEN l.learner THEN public.cleanup_mask_email(COALESCE(u.email, p.email)::TEXT)
              ELSE COALESCE(u.email, p.email)::TEXT END,
         COALESCE((SELECT array_agg(DISTINCT m.role ORDER BY m.role)
                   FROM public.workspace_members m WHERE m.profile_id = p.id), ARRAY[]::TEXT[]),
         (SELECT COUNT(*) FROM public.workspaces w WHERE w.owner_profile_id = p.id),
         COALESCE(p.is_platform_admin, FALSE),
         EXISTS (SELECT 1 FROM public.partners pa WHERE pa.profile_id = p.id),
         p.created_at,
         u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.auth_user_id
  CROSS JOIN LATERAL (SELECT public.cleanup_is_learner_account(p.id) AS learner) l
  -- Öğrenci/veli hesabı adıyla ARANAMAZ (ad sorgusu da bir sızıntı olurdu).
  WHERE v_q IS NULL
     OR (NOT l.learner AND p.full_name ILIKE '%' || v_q || '%')
     OR (NOT l.learner AND COALESCE(u.email, p.email) ILIKE '%' || v_q || '%')
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$fn$;

-- ------------------------------------------------------------
-- Yetkiler ve doğrulama (128 kalıbı)
-- ------------------------------------------------------------
DO $yetki$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'admin_cleanup_preview(text,uuid)',
    'admin_delete_workspace(uuid,text,text)',
    'admin_delete_partner(uuid,text,text)',
    'admin_delete_user(uuid,text,text)',
    'admin_list_users(text,integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', v_fn);
    IF has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '136 DOĞRULAMA: % anon''a açık.', v_fn;
    END IF;
    IF pg_get_functiondef(('public.' || v_fn)::regprocedure) NOT LIKE '%is_platform_admin()%' THEN
      RAISE EXCEPTION '136 DOĞRULAMA: % yönetici denetimi yapmıyor.', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'admin_delete_workspace(uuid,text,text)',
    'admin_delete_partner(uuid,text,text)',
    'admin_delete_user(uuid,text,text)'
  ] LOOP
    IF pg_get_functiondef(('public.' || v_fn)::regprocedure) NOT LIKE '%record_admin_action%' THEN
      RAISE EXCEPTION '136 DOĞRULAMA: % yönetim kaydı yazmıyor.', v_fn;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.admin_profile_blockers(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_workspace_facts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '136 DOĞRULAMA: iç yardımcı istemciye açık.';
  END IF;
  RAISE NOTICE '136: seçerek temizleme işlemleri hazır.';
END;
$yetki$;

-- ROLLBACK (silinen veri geri gelmez; yalnız fonksiyonlar kalkar):
--   DROP FUNCTION public.admin_list_users(text,integer);
--   DROP FUNCTION public.admin_delete_user(uuid,text,text);
--   DROP FUNCTION public.admin_delete_partner(uuid,text,text);
--   DROP FUNCTION public.admin_delete_workspace(uuid,text,text);
--   DROP FUNCTION public.admin_cleanup_preview(text,uuid);
--   DROP FUNCTION public.admin_profile_blockers(uuid);
--   DROP FUNCTION public.admin_workspace_facts(uuid);
--   DROP FUNCTION public.cleanup_mask_email(text);
--   DROP FUNCTION public.cleanup_is_learner_account(uuid);
