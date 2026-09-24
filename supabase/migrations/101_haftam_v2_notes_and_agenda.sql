-- ============================================================
-- 101 — HAFTAM V2: GÜN NOTU, ÇALIŞMA NOTU, KİŞİSEL AJANDA (R8)
--
-- Haftam V2 belgesi öğrencinin haftasını tek ekranda yaşamasını istiyor.
-- Ekranın veri omurgası çoğunlukla duruyordu (097'nin `planned_for_date`,
-- `weekly_flows`, mevcut teslim/onay akışı). Eksik olan ÜÇ yazı türü:
--
--   §12 çalışmaya özel akademik not
--   §13 günün akademik notu
--   §14 öğrencinin kişisel alanı
--
-- ============================================================
-- NEDEN `academic_notes` KULLANILMIYOR
--
-- 031 akademik notları öğretmenin KENDİ öğrenci hafızası olarak kurdu ve
-- öğrenci/veli için RLS politikası BİLEREK yazmadı ("RLS açık ve politika
-- yoksa erişim yoktur"). O tablo öğretmenin öğrenci hakkında tuttuğu
-- nottur; buradakiler öğrencinin KENDİ yazdığı notlardır. Öğrenciye o
-- tabloya yazma hakkı vermek, 031'in koruduğu gizlilik kararını
-- sessizce iptal ederdi.
--
-- ============================================================
-- GİZLİLİK ŞEMAYA GÖMÜLÜ, UYGULAMA KATMANINA BIRAKILMADI
--
-- Belgenin en sert maddesi §14: kişisel alan öğretmene ve veliye
-- GÖRÜNMEZ, akademik istatistiğe girmez, performans puanına dönüşmez.
-- Bunu "sorgularda seçmeyiz" diye geçmek, ileride bir view'ın yanlışlıkla
-- join etmesiyle çöker. 031'in yöntemi izleniyor: `student_personal_items`
-- için öğretmen ve veli politikası HİÇ YAZILMIYOR. Yanlışlıkla join eden
-- bir sorgu bile öğretmen oturumunda BOŞ döner.
--
-- Gün notu ve çalışma notu için kural farklı ve belgede açık: bunlar
-- "öğrenci + öğretmen arasında kalır" (§13). Yani öğretmen OKUR, yazamaz;
-- veli için politika yine yazılmaz.
--
-- ============================================================
-- NEDEN GÜN BAŞINA TEK NOT
--
-- §13 gün notunu bir günlük defteri değil, o günün BAĞLAMI olarak
-- tanımlıyor ("Perşembe sınavım var, bugün ona hazırlanıyorum"). Gün
-- başına birikmiş bir liste, öğretmenin akışında aynı günden beş satır
-- demek olurdu. UNIQUE (student_id, note_date) + upsert: öğrenci yazdıkça
-- günün notu güncellenir.
--
-- KRİTİK İLKE (§13): öğrenci not yazmadığı için hiçbir yerde "eksik" ya da
-- "başarısız" sayılmaz. Bu yüzden bu tabloların hiçbirinde "zorunlu" bir
-- alan, hiçbir yerde "not yazılmadı" cezası yok. Not bağlam sağlar,
-- çalışmanın yerine geçmez.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 0) ÇALIŞMA ALANI TUTARLILIĞI
--
-- Bu tabloların yazma politikaları `is_student_self` ile korunuyor: satır
-- bütünüyle öğrenciye ait, o yüzden 097'deki gibi tek sütunu açan bir
-- SECURITY DEFINER RPC'ye gerek yok.
--
-- Ama yalnız `is_student_self` yetmez: öğrenci kendi `student_id`'siyle
-- BAŞKA bir çalışma alanının id'sini yazabilirdi. Satır o alanda kimseye
-- görünmezdi ama veri yine de yanlış kiracıya yazılmış olurdu. Çalışma
-- alanı istemciden gelen bir değer değil, öğrenciden TÜRETİLEN bir
-- değerdir; kural politikada yaşasın ki her yazma yolu için tekrar
-- yazılması gerekmesin.
-- ============================================================
CREATE OR REPLACE FUNCTION public.student_workspace_matches(
  p_student_id UUID,
  p_workspace_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.workspace_id = p_workspace_id
  );
$$;

-- ============================================================
-- 1) GÜNÜN AKADEMİK NOTU (§13)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_day_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- Gün düzeyinde tutulur, saat taşımaz — `planned_for_date` ile aynı eksen.
  note_date    DATE NOT NULL,
  note_text    TEXT NOT NULL CHECK (length(btrim(note_text)) > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_day_notes_student_date
  ON public.student_day_notes (student_id, note_date);

CREATE INDEX IF NOT EXISTS idx_day_notes_workspace
  ON public.student_day_notes (workspace_id, updated_at DESC);

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_day_notes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_day_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.student_day_notes ENABLE ROW LEVEL SECURITY;

-- Öğrenci kendi notunu yazar, okur, değiştirir, siler.
DROP POLICY IF EXISTS day_notes_all_student ON public.student_day_notes;
CREATE POLICY day_notes_all_student ON public.student_day_notes
  FOR ALL USING ((SELECT public.is_student_self(student_id)))
  WITH CHECK (
    (SELECT public.is_student_self(student_id))
    AND (SELECT public.student_workspace_matches(student_id, workspace_id))
  );

-- Öğretmen YALNIZ OKUR (§13: "öğrenci + öğretmen arasında kalır").
-- Öğretmenin öğrenci ağzından not yazabilmesi, notun bağlam değerini
-- yok ederdi.
DROP POLICY IF EXISTS day_notes_select_teacher ON public.student_day_notes;
CREATE POLICY day_notes_select_teacher ON public.student_day_notes
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

-- VELİ İÇİN POLİTİKA YOK — bilinçli (§13: "veliye otomatik görünmez").

-- ============================================================
-- 2) ÇALIŞMAYA ÖZEL AKADEMİK NOT (§12)
--
-- "Koçluğa ekle / Öğretmene gönder / Paylaş" gibi bir eylem YOKTUR:
-- notun resmî çalışma alanına yazılmış olması, zaten öğretmenle
-- paylaşılmış olması demektir. Bu yüzden burada bir `shared` bayrağı ya
-- da bir gönderim durumu tutulmuyor.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.homework_item_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  homework_item_id UUID NOT NULL REFERENCES public.homework_items(id) ON DELETE CASCADE,
  note_text        TEXT NOT NULL CHECK (length(btrim(note_text)) > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Çalışma başına tek not: aynı satırda ikinci bir not, öğretmenin
-- gördüğü bağlamı bölerdi.
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_notes_item
  ON public.homework_item_notes (homework_item_id);

CREATE INDEX IF NOT EXISTS idx_item_notes_student
  ON public.homework_item_notes (student_id, updated_at DESC);

DROP TRIGGER IF EXISTS handle_updated_at ON public.homework_item_notes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.homework_item_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.homework_item_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_notes_all_student ON public.homework_item_notes;
CREATE POLICY item_notes_all_student ON public.homework_item_notes
  FOR ALL USING ((SELECT public.is_student_self(student_id)))
  WITH CHECK (
    (SELECT public.is_student_self(student_id))
    AND (SELECT public.student_workspace_matches(student_id, workspace_id))
  );

DROP POLICY IF EXISTS item_notes_select_teacher ON public.homework_item_notes;
CREATE POLICY item_notes_select_teacher ON public.homework_item_notes
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

-- VELİ İÇİN POLİTİKA YOK — bilinçli (§12).

-- ============================================================
-- 3) KİŞİSEL AJANDA (§14)
--
-- BU TABLO HİÇBİR İSTATİSTİĞE BAĞLANMAZ. Ne bir view'a, ne bir rapora,
-- ne performans puanına (§21). "20 paragraf çöz", "Pilates", "10 sayfa
-- kitap oku" öğrencinin kendi hayatıdır; akademik yükün yanında
-- sayılması, öğrenciyi kendi ajandasını yazmaktan caydırırdı.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_personal_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  item_date    DATE NOT NULL,
  title        TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_items_student_date
  ON public.student_personal_items (student_id, item_date, order_index);

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_personal_items;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_personal_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.student_personal_items ENABLE ROW LEVEL SECURITY;

-- TEK POLİTİKA: yalnız öğrencinin kendisi. Öğretmen ve veli için
-- politika yazılmadı ve YAZILMAMALIDIR (§14). Bu, "yanlışlıkla ifşa"
-- riskini şemadan kaldırır.
DROP POLICY IF EXISTS personal_items_all_student ON public.student_personal_items;
CREATE POLICY personal_items_all_student ON public.student_personal_items
  FOR ALL USING ((SELECT public.is_student_self(student_id)))
  WITH CHECK (
    (SELECT public.is_student_self(student_id))
    AND (SELECT public.student_workspace_matches(student_id, workspace_id))
  );

-- ============================================================
-- ROLLBACK
--   DROP TABLE IF EXISTS public.student_personal_items;
--   DROP TABLE IF EXISTS public.homework_item_notes;
--   DROP TABLE IF EXISTS public.student_day_notes;
--   DROP FUNCTION IF EXISTS public.student_workspace_matches(UUID, UUID);
-- ============================================================
