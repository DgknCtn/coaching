-- ============================================================
-- 071_library_admin_membership
--
-- SORUN: ensure_library_workspace, kütüphaneyi KURAN yöneticiyi üye
-- yapıyor ama zaten kurulmuş bir kütüphaneye başka bir platform
-- yöneticisi eklenmiyordu. O yönetici kütüphaneye kitap yazamaz:
-- create_book_with_sections_and_tests gövdesinde has_workspace_role
-- arar ve üyeliği yoktur. Ekranda görünen tek şey "Permission denied"
-- olurdu — sebebi kimsenin tahmin edemeyeceği bir şey.
--
-- Ayrıca kütüphaneye içe aktarma artık /admin/kutuphane sayfasından
-- yapılıyor; yöneticiden önce çalışma alanı değiştirip sonra üye olmasını
-- beklemek, kaldırılan adımı geri getirmek olurdu.
--
-- ÇÖZÜM: fonksiyon adı zaten "ensure" — kurulumu değil, KULLANILABİLİR
-- OLMASINI garanti etsin. Kütüphane varsa çağıran yöneticinin üyeliği de
-- tamamlanır.
--
-- BU BİR YETKİ GENİŞLETMESİ DEĞİLDİR: gövde ilk satırda
-- is_platform_admin() istiyor. Kütüphaneye yazabilen küme değişmedi
-- (platform yöneticileri); yalnız o kümenin ikinci üyesi de artık
-- gerçekten yazabiliyor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_library_workspace()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id         UUID;
  v_profile_id UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_profile_id := public.current_profile_id();

  SELECT id INTO v_id FROM public.workspaces WHERE is_library LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.workspaces (
      name, type, owner_profile_id, is_library, plan, student_limit, trial_ends_at
    )
    VALUES (
      'Kaynak Kütüphanesi', 'institution', v_profile_id, TRUE, 'institution', NULL, NULL
    )
    RETURNING id INTO v_id;
  END IF;

  -- Kütüphane ister yeni kurulmuş ister eskiden beri var olsun: çağıran
  -- yönetici owner üyesi olmadan kitap yazamaz.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_id AND profile_id = v_profile_id AND role = 'owner'
  ) THEN
    INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
    VALUES (v_id, v_profile_id, 'owner', 'active')
    ON CONFLICT (workspace_id, profile_id, role) DO UPDATE SET status = 'active';
  END IF;

  RETURN v_id;
END;
$fn$;


-- ============================================================
-- ROLLBACK
--
-- Verilmiş üyelikler KALIR; geri almak, kütüphaneyi dolduran
-- yöneticinin kendi kaynaklarına erişimini kesmek olurdu.
--
--   -- 070'teki gövdeyi geri yükle (070_library_autopublish.sql
--   -- dosyasındaki CREATE OR REPLACE bloğu).
-- ============================================================
