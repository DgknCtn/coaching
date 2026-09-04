-- ============================================================
-- 052_plans_and_quota  —  Faz 4 (ticarileşme altyapısı)
--
-- Plan, öğrenci kotası, deneme süresi ve erişim durumu.
-- ÖDEME ENTEGRASYONU BU MIGRATION'DA YOK: sağlayıcı seçimi henüz
-- doğrulanmadı ve yanlış sağlayıcıyla başlamak, sonradan taşınması en
-- pahalı karardır. Buradaki her şey sağlayıcıdan bağımsızdır.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Şema
--
-- NEDEN LİMİT KOD YERİNE SATIRDA: limitin veritabanında olması iki şey
-- kazandırıyor. Birincisi tetikleyici onu okuyabiliyor, yani kural
-- uygulama katmanı atlansa da (PostgREST'e doğrudan istek) geçerli.
-- İkincisi tek bir müşteriye istisna tanımak kod değişikliği değil, tek
-- satırlık bir UPDATE oluyor.
--
-- `plan` etiket, `student_limit` uygulanan sayıdır. İkisi bilinçli olarak
-- ayrı: pazarlık edilmiş bir fiyat, planın adını değiştirmeden limitini
-- değiştirebilmeli.
-- ------------------------------------------------------------

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial',
  -- NULL = sınırsız. 0 anlamlı bir değer değil; sınırsızı 0 ile temsil
  -- etmek "limit yok" ile "hiç ekleyemez"i karıştırır.
  ADD COLUMN IF NOT EXISTS student_limit INTEGER,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_plan_chk') THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_plan_chk
      CHECK (plan IN ('trial', 'starter', 'coach', 'institution'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_student_limit_chk') THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_student_limit_chk
      CHECK (student_limit IS NULL OR student_limit > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.workspaces.plan IS
  'Etiket. Uygulanan sayı student_limit''tedir; ikisi bilinçli olarak ayrı.';
COMMENT ON COLUMN public.workspaces.student_limit IS
  'Aktif öğrenci tavanı. NULL = sınırsız.';

-- ------------------------------------------------------------
-- 2) MEVCUT KİRACILAR KORUNUYOR
--
-- Bugün var olan workspace'ler 'institution' + sınırsız olarak devralınır.
-- Gerekçe: bu kullanıcılar ürünü kota kavramı YOKKEN kullanmaya başladı.
-- Onlara geriye dönük bir tavan koymak, bir sabah 12 öğrencisi olan
-- öğretmenin 11'incisini kaybetmesi demek olurdu.
--
-- Faturalama devreye girdiğinde bu satırlar ELLE gözden geçirilmeli;
-- otomatik düşürülmemeli.
-- ------------------------------------------------------------
UPDATE public.workspaces
SET plan = 'institution', student_limit = NULL, trial_ends_at = NULL
WHERE plan = 'trial' AND created_at < NOW();

-- ------------------------------------------------------------
-- 3) DENEME SÜRESİ ERİŞİM KONTROLÜNE GİRİYOR
--
-- Karar: deneme bitince workspace TAMAMEN kapanır.
--
-- Süre dolumu SORGU ANINDA değerlendiriliyor, zamanlanmış bir iş yok.
-- Bir cron'un gecikmesi, kapanması gereken bir kiracıyı açık bırakırdı;
-- burada böyle bir pencere yok.
--
-- NOT — bilinçli bir taviz: bu karar öğrenci ve veliyi de kilitler,
-- oysa ödemeyle ilgileri yok. Bu yüzden aşağıdaki
-- get_workspace_access_state, engellenen kullanıcıya NEDENİNİ
-- söyleyebilmek için var; kimse sebepsiz giriş ekranına düşmemeli.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = p_workspace_id
      AND wm.profile_id   = public.current_profile_id()
      AND wm.status       = 'active'
      AND w.status        = 'active'
      AND (w.plan <> 'trial' OR w.trial_ends_at IS NULL OR w.trial_ends_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = p_workspace_id
      AND wm.profile_id   = public.current_profile_id()
      AND wm.role         = ANY(p_roles)
      AND wm.status       = 'active'
      AND w.status        = 'active'
      AND (w.plan <> 'trial' OR w.trial_ends_at IS NULL OR w.trial_ends_at > NOW())
  );
$$;

-- ------------------------------------------------------------
-- 4) ERİŞİM DURUMU — "neden giremiyorum?"
--
-- Askıya alınan ya da denemesi dolan workspace, RLS gereği kendi
-- üyelerine bile GÖRÜNMEZ olur (workspaces_select_member →
-- is_workspace_member). Bu fonksiyon olmasaydı kullanıcı hiçbir açıklama
-- görmeden /login'e düşerdi ve ne olduğunu anlamazdı.
--
-- SECURITY DEFINER ve RLS'i BİLİNÇLİ OLARAK atlar; ama yalnızca
-- ÇAĞIRANIN KENDİ üyeliklerine bakar ve kiracı verisi döndürmez —
-- yalnız durum, plan ve tarih.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_workspace_access_state()
RETURNS TABLE (
  workspace_id   UUID,
  workspace_name TEXT,
  role           TEXT,
  status         TEXT,
  plan           TEXT,
  trial_ends_at  TIMESTAMPTZ,
  blocked_reason TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    w.id,
    w.name,
    wm.role::TEXT,
    w.status::TEXT,
    w.plan::TEXT,
    w.trial_ends_at,
    CASE
      WHEN w.status = 'suspended' THEN 'suspended'
      WHEN w.status = 'archived'  THEN 'archived'
      WHEN w.plan = 'trial'
       AND w.trial_ends_at IS NOT NULL
       AND w.trial_ends_at <= NOW() THEN 'trial_expired'
      ELSE NULL
    END
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.profile_id = public.current_profile_id()
    AND wm.status = 'active'
  ORDER BY w.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_access_state() TO authenticated;

-- ------------------------------------------------------------
-- 5) ÖĞRENCİ KOTASI — veritabanı düzeyinde
--
-- NEDEN TETİKLEYİCİ, NEDEN UYGULAMA KATMANI DEĞİL: bu oturumda öğrenilen
-- ders tam olarak buydu (bkz. 049). Uygulama katmanındaki bir kontrol,
-- PostgREST'e doğrudan istek atan bir istemci tarafından atlanır.
-- Faturalama bir sayıya dayanıyorsa o sayı veritabanında korunmalı.
--
-- YALNIZ AKTİF ÖĞRENCİ sayılır: arşivlenen öğrenci kotadan düşer.
-- Aksi hâlde öğretmen dönem sonunda arşivlemekten kaçınır, veri şişer ve
-- fatura da yanlış çıkar.
--
-- Hata mesajı TÜRKÇE: dbErrorToTr Türkçe iş kuralı mesajlarını olduğu
-- gibi kullanıcıya geçirir (bkz. lib/auth-errors.ts).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_student_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  -- Yalnız yeni AKTİF öğrenci kotayı ilgilendirir; arşive alma ya da
  -- güncelleme bu yoldan geçmez.
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  SELECT student_limit INTO v_limit
  FROM public.workspaces
  WHERE id = NEW.workspace_id;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.students
  WHERE workspace_id = NEW.workspace_id
    AND status = 'active';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Planınızın öğrenci sınırına ulaştınız (% öğrenci). Yeni öğrenci eklemek için planınızı yükseltin ya da kullanılmayan öğrencileri arşivleyin.',
      v_limit;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_student_limit ON public.students;
CREATE TRIGGER trg_enforce_student_limit
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.enforce_student_limit();

-- ------------------------------------------------------------
-- 6) KULLANIM SAYACI — arayüzün "12 / 30" göstergesi
--
-- Ayrı bir fonksiyon çünkü öğretmenin kendi kotasını görmesi gerekiyor
-- ama `workspaces.student_limit` kolonunu okuması için ek bir politika
-- açmak istemiyoruz; bu fonksiyon yalnız sayıyı döndürür.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_workspace_usage(p_workspace_id UUID)
RETURNS TABLE (
  plan           TEXT,
  student_limit  INTEGER,
  active_students INTEGER,
  trial_ends_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    w.plan::TEXT,
    w.student_limit,
    (SELECT COUNT(*)::INTEGER FROM public.students s
      WHERE s.workspace_id = w.id AND s.status = 'active'),
    w.trial_ends_at
  FROM public.workspaces w
  WHERE w.id = p_workspace_id
    -- Yalnız kendi çalışma alanının kullanımını görebilir.
    AND public.has_workspace_role(w.id, ARRAY['owner', 'teacher']);
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_usage(UUID) TO authenticated;

-- ============================================================
-- ROLLBACK
--
--   DROP TRIGGER IF EXISTS trg_enforce_student_limit ON public.students;
--   DROP FUNCTION IF EXISTS public.enforce_student_limit();
--   DROP FUNCTION IF EXISTS public.get_workspace_usage(UUID);
--   DROP FUNCTION IF EXISTS public.get_workspace_access_state();
--   -- is_workspace_member / has_workspace_role: 051 gövdelerini geri yükle
--   ALTER TABLE public.workspaces
--     DROP COLUMN IF EXISTS plan,
--     DROP COLUMN IF EXISTS student_limit,
--     DROP COLUMN IF EXISTS trial_ends_at;
--
-- Geri alma kota ve deneme süresi kontrolünü tamamen kaldırır.
-- ============================================================
