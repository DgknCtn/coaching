-- ============================================================
-- 070_library_autopublish  (069'un eksiği)
--
-- SORUN: 069 "kütüphane alanındaki kitaplar approved'dır" diye yazıyordu
-- ama bunu HİÇBİR ŞEY YAPMIYORDU. Yönetici kütüphane alanına girip kitap
-- formunu ya da "Yedekten aktar"ı kullandığında kitap
-- `library_status = 'none'` ile açılıyor; koç tarafındaki RLS kolu ise
-- 'approved' arıyor. Sonuç: yönetici kütüphaneyi dolduruyor, koçlar boş
-- görüyor ve arada hiçbir hata mesajı yok.
--
-- ÇÖZÜM: kararı satırın yazıldığı yere koymak. Kütüphane alanına giren
-- her kitap yayına girer.
--
-- NEDEN OTOMATİK, NEDEN AYRI BİR "YAYINLA" DÜĞMESİ DEĞİL: kütüphane
-- alanının VAROLUŞ SEBEBİ zaten yayındaki kaynakları tutmak. Oraya
-- girip bilerek kitap ekleyen tek kişi platform yöneticisi; ondan bir de
-- ikinci bir düğmeye basmasını istemek, unutulduğunda sessizce görünmez
-- kalan kaynaklar demekti — yani düzeltilen hatanın aynısı.
--
-- Yayından kaldırmanın yolu duruyor: kitabı 'inactive'/'archived' yapmak
-- ya da library_status'u elle değiştirmek. Koç kolu İKİSİNİ birden arar
-- (status = 'active' AND library_status = 'approved').
--
-- İKİNCİ DÜZELTME: kütüphane alanı 'trial' planıyla açılıyordu.
-- trial_ends_at NULL olduğu için bugün çalışıyor, ama o alana bir
-- deneme bitiş tarihi yazıldığı gün has_workspace_role false döner ve
-- yönetici KENDİ kütüphanesine giremez. Kütüphane bir kiracı değil,
-- platform altyapısıdır; plan alanı buna göre sabitlenir.
-- ============================================================


-- ============================================================
-- 1) Kütüphaneye giren kitap yayına girer
-- ============================================================
CREATE OR REPLACE FUNCTION public.books_library_autopublish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = NEW.workspace_id AND w.is_library
  ) THEN
    -- 'rejected' KORUNUR: yönetici bir kaynağı bilerek yayından
    -- çıkardıysa, üzerinde yapılan sıradan bir düzenleme onu geri
    -- yayına almamalı.
    IF NEW.library_status IS DISTINCT FROM 'rejected' THEN
      NEW.library_status := 'approved';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS books_library_autopublish ON public.books;
CREATE TRIGGER books_library_autopublish
  BEFORE INSERT OR UPDATE OF workspace_id ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.books_library_autopublish();


-- ============================================================
-- 2) Kütüphaneye ZATEN girmiş kitapları yayına al
--
-- Yönetici 070'ten önce kitap eklediyse onlar 'none' durumunda asılı
-- kaldı. Geriye dönük düzeltme olmadan, düzeltmenin kendisi görünmez
-- olurdu: "kitapları girdim, hâlâ boş".
-- ============================================================
UPDATE public.books b
SET library_status = 'approved'
FROM public.workspaces w
WHERE w.id = b.workspace_id
  AND w.is_library
  AND b.library_status = 'none';


-- ============================================================
-- 3) Kütüphane alanı bir kiracı değildir
-- ============================================================
UPDATE public.workspaces
SET plan = 'institution', student_limit = NULL, trial_ends_at = NULL
WHERE is_library;

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

  SELECT id INTO v_id FROM public.workspaces WHERE is_library LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_profile_id := public.current_profile_id();

  INSERT INTO public.workspaces (
    name, type, owner_profile_id, is_library, plan, student_limit, trial_ends_at
  )
  VALUES (
    'Kaynak Kütüphanesi', 'institution', v_profile_id, TRUE, 'institution', NULL, NULL
  )
  RETURNING id INTO v_id;

  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_id, v_profile_id, 'owner', 'active')
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$fn$;


-- ============================================================
-- ROLLBACK
--
-- Yayına alınmış kitaplar 'approved' KALIR: geri almak, koçların
-- havuzuna eklediği kaynakların kaynağını görünmez yapardı.
--
--   DROP TRIGGER IF EXISTS books_library_autopublish ON public.books;
--   DROP FUNCTION IF EXISTS public.books_library_autopublish();
--
--   -- ensure_library_workspace'in 069'daki gövdesi geri yüklenmelidir
--   -- (069_book_library.sql dosyasındaki CREATE OR REPLACE bloğu).
-- ============================================================
