-- ============================================================
-- 125 — KULLANICI KENDİNİ PLATFORM YÖNETİCİSİ YAPAMAZ
--
-- ============================================================
-- AÇIK (28 Eylül 2026, canlıda doğrulandı)
--
-- 003'teki "profiles_update_own" politikası kullanıcının kendi profil
-- satırını SÜTUN KISITI OLMADAN güncellemesine izin veriyor. 060 aynı
-- tabloya is_platform_admin sütununu ekledi ve korumadı. Sonuç: oturum
-- açmış herhangi bir öğretmen, öğrenci ya da veli
--
--   PATCH /rest/v1/profiles?id=eq.<kendi id'si>  {"is_platform_admin": true}
--
-- ile tüm yönetim paneline (gelir, öğretmen listesi, müşteri verisi)
-- erişebiliyordu. Test hesabıyla aynı değeri yeniden yazarak doğrulandı:
-- 200 döndü.
--
-- DÜZELTME
--   Tetikleyici: istemci rolleri (authenticated, anon) bu bayrağı
--   değiştiremez ve true ile satır ekleyemez. Tetikleyici fonksiyonu
--   bilerek SECURITY INVOKER: current_user çağıranı gösterir. SQL Editor
--   (postgres) ve service_role etkilenmez; bayrak yalnız oradan verilir.
--   Değeri değiştirmeyen güncellemeler (ör. ad değişikliği) serbest.
--
-- UYGULADIKTAN SONRA — mevcut yöneticileri gözden geçirin. Açık kapanmadan
-- önce kendini yönetici yapmış biri varsa hâlâ yöneticidir:
--
--   SELECT id, full_name, email, created_at, updated_at
--   FROM public.profiles WHERE is_platform_admin ORDER BY updated_at DESC;
--
--   Tanımadığınız satır için:
--   UPDATE public.profiles SET is_platform_admin = FALSE WHERE id = '<id>';
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_platform_admin_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.is_platform_admin THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
      RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_platform_admin_flag() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_guard_platform_admin ON public.profiles;
CREATE TRIGGER trg_profiles_guard_platform_admin
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_platform_admin_flag();

DO $dogrula$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_profiles_guard_platform_admin'
      AND tgrelid = 'public.profiles'::regclass
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION '125 DOĞRULAMA: yönetici bayrağı tetikleyicisi yok ya da kapalı.';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.guard_platform_admin_flag()'::regprocedure) THEN
    RAISE EXCEPTION '125 DOĞRULAMA: tetikleyici SECURITY DEFINER; current_user çağıranı göstermez.';
  END IF;
  RAISE NOTICE '125: is_platform_admin yalnız SQL Editor / service_role ile değişir.';
END;
$dogrula$;

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_profiles_guard_platform_admin ON public.profiles;
--   DROP FUNCTION IF EXISTS public.guard_platform_admin_flag();
