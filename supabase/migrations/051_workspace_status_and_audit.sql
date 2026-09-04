-- ============================================================
-- 051_workspace_status_and_audit  —  Faz 3
--
-- ÜÇ İŞ: askıya alma, denetim kaydı, assistant rolünün kaldırılması.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ASKIYA ALMA — workspaces.status artık gerçekten okunuyor
--
-- SORUN: `workspaces.status` alanı 001'den beri 'suspended' değerini
-- kabul ediyordu ama HİÇBİR YERDE okunmuyordu. lib/workspace.ts workspace'i
-- `select('id, name')` ile çekiyor — status sorguya bile girmiyor; RLS
-- yardımcıları da bakmıyordu. Yani ödemesi durmuş bir kiracıyı kapatmanın
-- hiçbir yolu yoktu.
--
-- ÇÖZÜM: kontrol iki yardımcı fonksiyona konuyor. Uygulama katmanına değil,
-- çünkü uygulama katmanı atlanabilir: PostgREST üzerinden doğrudan sorgu
-- yapan bir istemci uygulamayı hiç görmez. Burada durunca askı, ürünün her
-- yüzeyinde aynı anda geçerli olur.
--
-- MEVCUT DAVRANIŞ KORUNUYOR: aktif workspace'lerde hiçbir şey değişmez.
-- 'suspended' ve 'archived' olanlarda tüm okuma/yazma kapanır.
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
      -- Askıya alınmış ya da arşivlenmiş kiracıda üyelik geçersizdir.
      AND w.status        = 'active'
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
  );
$$;

-- 002'deki diğer yardımcılara search_path sabitlemesi de burada yazılıyor.
-- 024 bunu toplu bir ALTER ile yapmıştı ama TANIMLARIN KENDİSİ düzeltilmemişti:
-- sıfırdan kurulan bir ortamda 002 yeniden uygulanırsa koruma sessizce
-- kaybolurdu.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_student_self(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students
    WHERE id         = p_student_id
      AND profile_id = public.current_profile_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_parent_of_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student_links
    WHERE student_id        = p_student_id
      AND parent_profile_id = public.current_profile_id()
      AND status            = 'active'
  );
$$;

-- ------------------------------------------------------------
-- 2) ASSISTANT ROLÜ KALDIRILIYOR
--
-- Rol 001'den beri şemada vardı ama FİİLEN KIRIKTI: middleware onu
-- /teacher alanına alıyor, lib/workspace.ts ise yalnız owner|teacher kabul
-- edip /login'e geri atıyordu. Yani asistan giriş yapıp hiçbir yere
-- gidemiyordu.
--
-- Yarım bir rol, yarım bir yetkilendirmedir: can_read_student onu öğrenci
-- verisine yetkili sayıyor ama hiçbir ekran ona açılmıyor. Bu ikilik
-- ileride yanlış tarafa çözülebilir.
--
-- KARAR: kaldır. Kurumsal planda gerçekten gerektiğinde tasarlanıp
-- eklenecek — o zaman hangi yetkilere sahip olacağı bilinçli olarak
-- kararlaştırılır.
--
-- VERİ: bugüne kadar hiç kullanılamadığı için assistant üyeliği olması
-- beklenmiyor; yine de varsa 'inactive' yapılır, SİLİNMEZ — geçmiş kayıt
-- sessizce yok edilmez.
-- ------------------------------------------------------------

UPDATE public.workspace_members
SET status = 'inactive', updated_at = NOW()
WHERE role = 'assistant' AND status = 'active';

CREATE OR REPLACE FUNCTION public.can_read_student(p_student_id UUID, p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(p_student_id)
    OR public.is_parent_of_student(p_student_id);
$$;

-- ------------------------------------------------------------
-- 3) DENETİM KAYDI
--
-- SORUN: "bu ödevi kim sildi?", "bu daveti kim iptal etti?" sorularının
-- cevabı yoktu. `created_by_profile_id` yalnız altı tabloda var;
-- `updated_by` hiçbir tabloda yok; soft-delete yok.
--
-- TASARIM: tek, EKLEME-ONLY bir olay tablosu. Neden tek tablo — her
-- tabloya ayrı denetim kolonu eklemek 40'tan fazla ALTER demek ve yine de
-- silme olaylarını yakalayamazdı (satır gidince kolon da gider).
--
-- Yazma yolu zaten SECURITY DEFINER RPC'lerden geçtiği için olay tek
-- noktadan yazılabiliyor: `log_audit_event`.
--
-- DEĞİŞMEZLİK: tabloda UPDATE ve DELETE politikası YOK. Öğretmen kendi
-- kiracısının kaydını OKUR, değiştiremez. Denetim kaydı değiştirilebiliyorsa
-- denetim kaydı değildir.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Eylemi yapan. Profil silinse bile olay kalmalı: SET NULL.
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Okunabilir kalsın diye ADI da kopyalanır: profil silindiğinde ya da
  -- adı değiştiğinde olayın o günkü hâli korunur.
  actor_name    TEXT,
  -- 'homework.approve', 'invite.revoke', 'book.delete_section' gibi.
  action        TEXT NOT NULL CHECK (length(btrim(action)) > 0),
  -- Etkilenen kaydın türü ve kimliği: 'student', 'homework_batch', ...
  entity_type   TEXT,
  entity_id     UUID,
  -- Serbest bağlam: kaç kalem onaylandı, hangi tarih verildi vb.
  -- Kişisel veri KOYULMAZ; bu tablo uzun ömürlüdür.
  detail        JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_workspace_time
  ON public.audit_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON public.audit_events (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Yalnız OKUMA politikası var. Yazma tek yoldan: log_audit_event.
DROP POLICY IF EXISTS audit_events_select_teacher ON public.audit_events;
CREATE POLICY audit_events_select_teacher ON public.audit_events
  FOR SELECT
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

REVOKE ALL ON public.audit_events FROM anon;
GRANT SELECT ON public.audit_events TO authenticated;

-- ------------------------------------------------------------
-- log_audit_event
--
-- HİÇBİR ZAMAN HATA FIRLATMAZ. Denetim kaydı yazılamadı diye asıl işlem
-- geri alınmamalı: ödev onayı, denetim satırı yazılamadığı için
-- başarısız olursa kullanıcı için çok daha kötü bir arıza olur.
-- Sorun sessizce yutulmaz, uyarı olarak loglanır.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_workspace_id UUID,
  p_action       TEXT,
  p_entity_type  TEXT DEFAULT NULL,
  p_entity_id    UUID DEFAULT NULL,
  p_detail       JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_name       TEXT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_name
  FROM public.profiles
  WHERE id = public.current_profile_id();

  INSERT INTO public.audit_events (
    workspace_id, actor_profile_id, actor_name,
    action, entity_type, entity_id, detail
  )
  VALUES (
    p_workspace_id, v_profile_id, v_name,
    p_action, p_entity_type, p_entity_id, COALESCE(p_detail, '{}'::JSONB)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'audit_events yazılamadı (action=%): %', p_action, SQLERRM;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, UUID, JSONB)
  TO authenticated;

-- ============================================================
-- ROLLBACK
--
--   -- Askıya alma kontrolünü kaldır (002'deki gövdeleri geri yükle):
--   CREATE OR REPLACE FUNCTION public.is_workspace_member ... (002 gövdesi)
--   CREATE OR REPLACE FUNCTION public.has_workspace_role  ... (002 gövdesi)
--   CREATE OR REPLACE FUNCTION public.can_read_student    ... (assistant ile)
--
--   DROP FUNCTION IF EXISTS public.log_audit_event(UUID, TEXT, TEXT, UUID, JSONB);
--   DROP TABLE IF EXISTS public.audit_events;
--
-- UYARI: askı kontrolünün geri alınması, ödemesi durmuş kiracıların
-- erişimini yeniden açar. 'inactive' yapılmış assistant üyelikleri geri
-- alma ile AKTİFLEŞMEZ; gerekirse elle güncellenmeli.
-- ============================================================
