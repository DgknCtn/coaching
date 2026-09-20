-- ============================================================
-- 098 — KAYNAK MİMARİSİ (R7 / Kaynaklar, 20.09.2026)
-- ============================================================
--
-- Belgenin tek cümlesi: *"Kitaplar envanteri kurar; Kaynak Planı
-- stratejiyi yönetir."* Bu dosya o ayrımın veri katmanıdır.
--
--   §4.1 / §5.2  Ders-kapsam bazlı gruplama   -> 1) scope_id
--   §4.2         Yeni kaynak Bekliyor açılır  -> 2) assign_book_to_student
--   §5.3 / §6.3  Bu hafta verilen / açık ödev -> 3) hafta sinyali görünümü
--   §7.3         Havuz temizliği              -> 4) delete_unassigned_book
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu. Veri kaybı yok.


-- ============================================================
-- 1) student_book_assignments.scope_id
--
-- Kaynağın hangi akademik alana ait olduğu ÖĞRENCİ-KİTAP İLİŞKİSİNİN
-- özelliğidir, kitabın değil (§4.2: "Kitap katalog etiketi filtrelemeye
-- yardım eder; öğrencideki akademik alanı tek başına belirlemez").
-- Aynı fasikül bir öğrencide TYT Matematik, başkasında 10. Sınıf
-- Matematik kapsamında olabilir. Bu yüzden books'a değil, role/status
-- ile aynı satıra yazılır (036 ile aynı gerekçe).
--
-- NULLABLE VE BACKFILL YOK: alan TAHMİN EDİLMEZ. books.subject'ten
-- türetmek "TYT Matematik" ile "AYT Matematik"i ayıramaz ve yanlış
-- tahmin ders bloklarını sessizce bozardı (034'ün curriculum_program
-- kararıyla aynı ilke). Alanı boş kaynaklar arayüzde "Alan atanmamış"
-- başlığı altında toplanır ve düzeltme aksiyonu taşır.
--
-- ON DELETE SET NULL: scope silinirse kaynak atamasının kendisi
-- kaybolmaz; yalnız gruplaması düşer ve öğretmenden yeniden istenir.
-- ============================================================
ALTER TABLE public.student_book_assignments
  ADD COLUMN IF NOT EXISTS scope_id UUID
    REFERENCES public.academic_scopes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sba_scope
  ON public.student_book_assignments (student_id, scope_id);

COMMENT ON COLUMN public.student_book_assignments.scope_id IS
  'R7 Kaynak Mimarisi: kaynağın bu öğrencideki akademik alanı '
  '(academic_scopes). Kitabın değil öğrenci-kitap ilişkisinin '
  'özelliğidir. NULL = alan atanmamış; tahmin edilmez.';


-- ============================================================
-- 2) assign_book_to_student — alan parametresi + Bekliyor açılışı
--
-- İKİ DEĞİŞİKLİK (§4.2):
--
--   a) p_scope_id eklendi. Kitap Ata akışı artık Ders/Kapsam soruyor;
--      ders bloğundan açıldığında otomatik dolu gelir.
--
--   b) Yeni atama 'pending' (Bekliyor) açılır. Bugün kolon default'u
--      'active' olduğu için atanan her kaynak anında haftalık genel
--      tempoya giriyordu — oysa henüz rolü, hedef kapsamı ve tarihi
--      yok. "Bekliyor yalnız bir niyet beyanıdır" (036): kilit/koşul
--      motoru YOKTUR, öğretmen tek tıkla Aktif'e alır.
--
--      KOLON DEFAULT'U DEĞİŞTİRİLMEZ: başka yazarlar (kütüphane
--      kopyası, içe aktarma, testler) bu RPC'den geçmiyor ve
--      davranışları değişmemeli. Karar bu akışa özgüdür, tabloya değil.
--
-- p_start_date / p_target_end_date parametreleri KORUNUR: imza
-- daralırsa eski çağrılar sessizce patlar. Diyalog artık NULL geçiyor,
-- tarihler Kaynak Planı'nda belirleniyor.
-- ============================================================
-- ÖNCE ESKİ İMZA DÜŞÜRÜLÜR: CREATE OR REPLACE bir fonksiyonun parametre
-- listesini değiştiremez; yeni parametreyle yazılan tanım AYRI bir aşırı
-- yükleme olurdu ve 6 argümanlı eski çağrı "function is not unique"
-- hatasına düşerdi.
DROP FUNCTION IF EXISTS public.assign_book_to_student(UUID, UUID, UUID, UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.assign_book_to_student(
  p_workspace_id      UUID,
  p_student_id        UUID,
  p_book_id           UUID,
  p_academic_term_id  UUID,
  p_start_date        DATE DEFAULT NULL,
  p_target_end_date   DATE DEFAULT NULL,
  p_scope_id          UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_profile_id  UUID;
  v_sba_id      UUID;
BEGIN
  v_profile_id := public.current_profile_id();

  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.books
    WHERE id = p_book_id AND workspace_id = p_workspace_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Book not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = p_student_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  -- Alan opsiyoneldir ama verildiyse aynı çalışma alanına ait olmalı:
  -- başka bir workspace'in scope'u bu öğrencinin bloklarında görünemez.
  IF p_scope_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.academic_scopes
    WHERE id = p_scope_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Scope not found';
  END IF;

  INSERT INTO public.student_book_assignments (
    workspace_id, academic_term_id, student_id, book_id,
    assigned_by_profile_id, start_date, target_end_date, scope_id, status
  ) VALUES (
    p_workspace_id, p_academic_term_id, p_student_id, p_book_id,
    v_profile_id, p_start_date, p_target_end_date, p_scope_id, 'pending'
  )
  RETURNING id INTO v_sba_id;

  RETURN jsonb_build_object('student_book_assignment_id', v_sba_id);
END;
$fn$;


-- ============================================================
-- 3) set_student_book_scope — alanı sonradan düzeltmek
--
-- Atama sırasında alan seçilmemiş ya da yanlış seçilmiş olabilir.
-- Yazma yolu projenin kuralı gereği SECURITY DEFINER RPC'den geçer
-- (036'nın set_student_book_plan'ı ile aynı kalıp).
--
-- p_scope_id NULL geçilirse alan TEMİZLENİR — burada "NULL = dokunma"
-- kuralı yoktur, çünkü tek bir alan yazılıyor ve onu boşaltmak geçerli
-- bir işlemdir (kaynak yanlış alana konmuşsa önce boşaltılabilmeli).
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_student_book_scope(
  p_assignment_id UUID,
  p_scope_id      UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_book_assignments
  WHERE id = p_assignment_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_scope_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.academic_scopes
    WHERE id = p_scope_id AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Scope not found';
  END IF;

  UPDATE public.student_book_assignments
  SET scope_id   = p_scope_id,
      updated_at = NOW()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object('assignment_id', p_assignment_id);
END;
$fn$;


-- ============================================================
-- 4) student_resource_week_signal_view — "bu hafta verilen" + "açık ödev"
--
-- §5.3 her kaynak satırında iki sayı istiyor ve §6.3 ikisinin ANLAMINI
-- ayırıyor:
--
--   bu hafta verilen  -> bu haftanın teslim tarihli ödev kalemleri.
--                        0 olması EKSİK DEĞİLDİR; öğretmen bilinçli
--                        olarak daha az verebilir. Nötr gösterilir.
--   açık ödev         -> henüz kapanmamış TÜM kalemler, haftadan
--                        bağımsız. Geçmiş haftadan kalan açık iş bu
--                        haftanın kotasından OTOMATİK DÜŞÜLMEZ.
--
-- Hafta sınırı DATE_TRUNC('week', ...) ile pazartesi başlangıçlıdır —
-- 004'teki student_weekly_homework_summary_view ile aynı kalıp, iki
-- ekran farklı hafta sınırı görmesin diye.
--
-- İPTAL EDİLMİŞ KALEM VE ARŞİVLENMİŞ GRUP SAYILMAZ: 097'nin "Aktif
-- Yükten Çıkar" akışı batch'i archived, kalemleri cancelled yapıyor;
-- okuma tarafının tamamı bunları süzüyor, bu görünüm de süzer.
-- ============================================================
CREATE OR REPLACE VIEW public.student_resource_week_signal_view
WITH (security_invoker = true) AS
SELECT
  hi.workspace_id,
  hb.student_id,
  hi.student_book_assignment_id                        AS assignment_id,
  DATE_TRUNC('week', CURRENT_DATE)::DATE               AS week_start,
  COUNT(*) FILTER (
    WHERE hb.due_date >= DATE_TRUNC('week', CURRENT_DATE)::DATE
      AND hb.due_date <  DATE_TRUNC('week', CURRENT_DATE)::DATE + 7
  )                                                    AS assigned_this_week,
  COUNT(*) FILTER (WHERE hi.status = 'pending')        AS open_items
FROM public.homework_items hi
JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
WHERE hi.status <> 'cancelled'
  AND hb.status = 'active'
GROUP BY hi.workspace_id, hb.student_id, hi.student_book_assignment_id;

COMMENT ON VIEW public.student_resource_week_signal_view IS
  'R7 §5.3/§6.3: kaynak bazında bu hafta verilen çalışma ve açık ödev '
  'sayısı. 0 değeri nötrdür, eksiklik sinyali değildir.';

-- security_invoker (049): görünüm ÇAĞIRANIN haklarıyla çalışır, yani
-- alttaki tabloların RLS politikaları aynen geçerlidir.
GRANT SELECT ON public.student_resource_week_signal_view TO authenticated;


-- ============================================================
-- 5) delete_unassigned_book — havuz temizliği (§7.3)
--
-- İKİ AYRI FİİL, TEK AYRIM NOKTASI: kaynak hiç kullanıldı mı?
--
--   hiç atanmamış yanlış kayıt -> SİL. Yanlış girilmiş bir kitabı
--                                 sonsuza dek arşivde taşımak havuzu
--                                 kirli tutar.
--   atanmış/kullanılmış kaynak -> ARŞİVLE (mevcut archiveBookAction).
--                                 Geçmiş kayıtlar bozulmamalı.
--
-- Bu fonksiyon YALNIZ ilk durumu üstlenir ve ataması olan kitapta hata
-- verir — "Sil" düğmesi yanlışlıkla geçmiş veriyi silemez. Kontrol
-- arayüzde değil BURADA: yazma yolu tek giriş noktasından geçtiği için
-- iki sekme aynı anda çalışsa bile güvenlidir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_unassigned_book(
  p_workspace_id UUID,
  p_book_id      UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.books
    WHERE id = p_book_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Book not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_book_assignments
    WHERE book_id = p_book_id
  ) THEN
    RAISE EXCEPTION 'Book is assigned';
  END IF;

  -- Bölüm/test satırları books'a ON DELETE CASCADE ile bağlı (001);
  -- ataması olmayan kitapta bunlardan başka bağımlı kayıt yoktur.
  DELETE FROM public.books
  WHERE id = p_book_id AND workspace_id = p_workspace_id;

  RETURN jsonb_build_object('deleted_book_id', p_book_id);
END;
$fn$;


-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.delete_unassigned_book(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.set_student_book_scope(UUID, UUID);
--   DROP VIEW IF EXISTS public.student_resource_week_signal_view;
--
--   -- RPC'yi 005'teki hâline döndürün (7 parametreli sürümü düşürün):
--   DROP FUNCTION IF EXISTS public.assign_book_to_student(
--     UUID, UUID, UUID, UUID, DATE, DATE, UUID);
--   -- ardından 005_rpc_functions.sql'deki tanımı yeniden çalıştırın.
--
--   -- 'pending' açılan atamalar kalır; gerekirse önce aktifleyin:
--   SELECT id, student_id, book_id FROM public.student_book_assignments
--   WHERE status = 'pending';
--
--   DROP INDEX IF EXISTS public.idx_sba_scope;
--   ALTER TABLE public.student_book_assignments DROP COLUMN IF EXISTS scope_id;
-- ============================================================
