-- ============================================================
-- 074_service_structure  (R7 / Site Testi 04 Rev.3 — Hizmet Yapısı)
--
-- SORUN: `students.lesson_type` (012) TEK SEÇİMLİ. Gerçek kullanımda aynı
-- öğrenci aynı anda birden fazla hizmet alıyor — örn. Çarşamba 20:00
-- online grup matematik + Cumartesi 10:00 bireysel koçluk. Tek seçim bu
-- gerçeği taşıyamıyor; dahası alan bugün HİÇBİR iş mantığına bağlı değil.
--
-- ÇÖZÜM: hizmet, öğrencinin bir kolonu değil KENDİ SATIRI olur.
--
-- ============================================================
-- ÜÇ EKSEN, TEK SATIR (§5.3)
-- ============================================================
-- Hizmet:  ders | kocluk
-- Katılım: birebir | grup
-- Ortam:   online | yuz_yuze
--
-- Üçü ayrı kolon; "online_grup_matematik" gibi birleşik tek etiket
-- DEĞİL. Birleşik etiket her yeni kombinasyonda yeni bir enum değeri
-- gerektirirdi ve "tüm grup dersleri" gibi bir soruyu LIKE ile
-- cevaplatırdı.
--
-- ============================================================
-- SİLME YOK, PASİFE ALMA VAR (§5.1)
-- ============================================================
-- Hizmet silinirse geçmiş oturumlar sahipsiz kalır ve sezon özeti
-- geriye dönük değişir. `status='passive'` geçmişi olduğu yerde bırakır.
--
-- ============================================================
-- PLANLANAN != GERÇEKLEŞEN (§7.A)
-- ============================================================
-- `service_sessions.planned_at` İLK planlanan zamandır ve ASLA üzerine
-- yazılmaz. Kesinleşmiş yeni zaman `actual_at`e gider. Böylece öğrenci
-- ve veli ekranı "19 Eyl 10:00 -> 20 Eyl 11:00" diyebilir; tek kolon
-- olsaydı ilk taahhüt kaybolurdu.
--
-- ============================================================
-- OTOMATİK "YAPILMADI" YOK (§7.B)
-- ============================================================
-- Saatin geçmesi hizmetin verilmediği anlamına gelmez — öğretmen dersi
-- yapmış, kaydı henüz işaretlememiş olabilir. Bu yüzden şemada
-- `planlandi` durumunu zamana göre değiştiren HİÇBİR trigger veya cron
-- yoktur. "Durum güncellenmedi", bir veritabanı durumu değil, arayüzün
-- planlandi + geçmiş saat okumasıdır.
--
-- ============================================================
-- HAFTANIN GÜNÜ: ISODOW (1=Pazartesi .. 7=Pazar)
-- ============================================================
-- Postgres'in EXTRACT(ISODOW FROM ...) çıktısıyla birebir aynı. 0-6
-- seçilseydi her sorguda bir kaydırma yapılır ve er geç biri unuturdu.
-- ============================================================


-- ============================================================
-- 1) student_groups — grup dersinin tek sahibi
--
-- Grup oturumu TEK noktadan yönetilir (§9): grubun dersi bir kez
-- "Yapıldı" işaretlenir, gruptaki aktif öğrencilerin hizmet geçmişine
-- yansır. Grup satırı olmasaydı aynı ders N öğrencide N kez elle
-- işaretlenirdi ve biri unutulduğunda sezon özeti sessizce şaşardı.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  subject      TEXT CHECK (subject IS NULL OR length(subject) <= 80),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'passive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_groups_workspace
  ON public.student_groups (workspace_id, status);

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_groups;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_groups_rw ON public.student_groups;
CREATE POLICY student_groups_rw ON public.student_groups
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));


-- ============================================================
-- 2) student_services — öğrencinin aktif hizmetleri
--
-- `submission_offset_minutes`: Haftalık Akışın Son Teslimi normalde ana
-- temasın SAATİDİR. R7-01 grup dersi için "ders - 6 saat" öneriyordu;
-- ürün kararı bunu zorunlu bir kural değil, hizmet başına opsiyonel bir
-- kaydırma yapmak oldu (varsayılan 0). Böylece ikinci bir bağımsız
-- deadline kavramı doğmaz — tek otorite yine akışın Son Teslim alanıdır.
--
-- `finance_link`: hizmetin parasal karşılığının NASIL kurulduğu. Tutar
-- burada değil, 066'daki finans tablolarında yaşar; burada yalnız bağın
-- TÜRÜ var.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_services (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  kind          TEXT NOT NULL CHECK (kind IN ('ders', 'kocluk')),
  participation TEXT NOT NULL CHECK (participation IN ('birebir', 'grup')),
  medium        TEXT NOT NULL CHECK (medium IN ('online', 'yuz_yuze')),

  -- Grup hizmetinde zorunlu, birebirde yasak (aşağıdaki CHECK).
  group_id UUID REFERENCES public.student_groups(id) ON DELETE RESTRICT,

  weekday                  SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time               TIME NOT NULL,
  planned_duration_minutes SMALLINT NOT NULL
                           CHECK (planned_duration_minutes BETWEEN 5 AND 600),
  start_date               DATE NOT NULL,

  submission_offset_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (submission_offset_minutes BETWEEN 0 AND 10080),

  finance_link TEXT NOT NULL DEFAULT 'haric'
    CHECK (finance_link IN ('aylik_paket', 'ders_basi', 'haric')),

  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'passive')),
  note       TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Grup seçildi ama grup belirtilmedi" durumunu şema seviyesinde
-- imkânsız kılar; arayüz doğrulaması unutulsa bile satır yazılamaz.
ALTER TABLE public.student_services
  DROP CONSTRAINT IF EXISTS student_services_group_matches_participation;
ALTER TABLE public.student_services
  ADD CONSTRAINT student_services_group_matches_participation
  CHECK (
    (participation = 'grup'    AND group_id IS NOT NULL) OR
    (participation = 'birebir' AND group_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_student_services_student
  ON public.student_services (student_id, status);

CREATE INDEX IF NOT EXISTS idx_student_services_workspace
  ON public.student_services (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_student_services_group
  ON public.student_services (group_id) WHERE group_id IS NOT NULL;

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_services;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.student_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_services_rw ON public.student_services;
CREATE POLICY student_services_rw ON public.student_services
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

-- Öğrenci ve velinin OKUMASI: kesinleşmiş program ikisinin de ortak
-- kaydıdır (§8). Yazma yok — hizmet düzenini yalnız öğretmen kurar.
DROP POLICY IF EXISTS student_services_read_self ON public.student_services;
CREATE POLICY student_services_read_self ON public.student_services
  FOR SELECT
  USING (
    (SELECT public.is_student_self(student_id)) OR
    (SELECT public.is_parent_of_student(student_id))
  );


-- ============================================================
-- 3) group_sessions — grubun tek oturum kaydı
--
-- Gruptaki her öğrencinin service_sessions satırı buna bağlanır:
-- öğretmen bir kez işaretler, N öğrenciye yansır.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.group_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  group_id     UUID NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  planned_at   TIMESTAMPTZ NOT NULL,
  actual_at    TIMESTAMPTZ,
  duration_minutes SMALLINT
    CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 600),
  status       TEXT NOT NULL DEFAULT 'planlandi'
               CHECK (status IN ('planlandi', 'yapildi', 'ertelendi', 'iptal', 'yapilmadi')),
  note         TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Oturum üretimi (generate_service_sessions) tekrar tekrar
-- çağrılabilmeli; aynı slot iki kez üretilmemeli.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_group_session_slot
  ON public.group_sessions (group_id, planned_at);

DROP TRIGGER IF EXISTS handle_updated_at ON public.group_sessions;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS group_sessions_rw ON public.group_sessions;
CREATE POLICY group_sessions_rw ON public.group_sessions
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));


-- ============================================================
-- 4) service_sessions — planlanan ve gerçekleşen oturumlar
--
-- TELAFİ (§7.C): `makeup_of_session_id` telafiyi ASIL oturuma bağlar.
-- Telafi hangi ayda yapılırsa yapılsın asıl ayın hizmet borcuna aittir;
-- bu yüzden aylık sayaç telafi satırının kendi tarihine değil, bağlı
-- olduğu asıl oturumun ayına bakar. Bağ olmasaydı Ekim'de yapılan bir
-- Eylül telafisi Ekim paketine fazladan hizmet yazardı.
--
-- `attended` (§9): grup oturumu yapıldı ama BU öğrenci katılmadı
-- istisnası. NULL = istisna yok.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  service_id   UUID NOT NULL REFERENCES public.student_services(id) ON DELETE CASCADE,
  group_session_id UUID REFERENCES public.group_sessions(id) ON DELETE CASCADE,

  -- İLK planlanan zaman. Üzerine YAZILMAZ.
  planned_at TIMESTAMPTZ NOT NULL,
  -- Kesinleşmiş yeni zaman (ertelendiyse) veya gerçekleşme zamanı.
  actual_at  TIMESTAMPTZ,

  duration_minutes SMALLINT
    CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 600),

  status TEXT NOT NULL DEFAULT 'planlandi'
         CHECK (status IN ('planlandi', 'yapildi', 'ertelendi', 'iptal', 'yapilmadi')),

  makeup_of_session_id UUID REFERENCES public.service_sessions(id) ON DELETE SET NULL,
  attended BOOLEAN,

  note       TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Oturum üretimi idempotent olsun. Telafi satırları bu kuralın DIŞINDA:
-- onlar asıl slotun kopyası değil, ayrı bir oturumdur.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_session_slot
  ON public.service_sessions (service_id, planned_at)
  WHERE makeup_of_session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_sessions_student_time
  ON public.service_sessions (student_id, planned_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_sessions_workspace_time
  ON public.service_sessions (workspace_id, planned_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_sessions_makeup
  ON public.service_sessions (makeup_of_session_id)
  WHERE makeup_of_session_id IS NOT NULL;

-- "Sıradaki temas" Dashboard'un sıralama eksenidir (R7-01 §6): açık
-- oturumlar zamana göre taranır.
CREATE INDEX IF NOT EXISTS idx_service_sessions_open
  ON public.service_sessions (workspace_id, planned_at)
  WHERE status = 'planlandi';

DROP TRIGGER IF EXISTS handle_updated_at ON public.service_sessions;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.service_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.service_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_sessions_rw ON public.service_sessions;
CREATE POLICY service_sessions_rw ON public.service_sessions
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

-- Veli "bu ay kaç görüşme yapıldı" sorusunu buradan görür (§8). Ödeme
-- hesabı BURADA YAPILMAZ; bu yalnız verilen hizmetin ortak kaydıdır.
DROP POLICY IF EXISTS service_sessions_read_self ON public.service_sessions;
CREATE POLICY service_sessions_read_self ON public.service_sessions
  FOR SELECT
  USING (
    (SELECT public.is_student_self(student_id)) OR
    (SELECT public.is_parent_of_student(student_id))
  );


-- ============================================================
-- 5) students.lesson_type -> student_services (012 GÖÇÜ)
--
-- Eski tek seçimli alan KALIR (geriye dönük uyum ve geri alma yolu için)
-- ama artık okunmaz. Değeri olan her öğrenci için tek satırlık bir hizmet
-- üretilir.
--
-- GÜN/SAAT BİLİNMİYOR: eski alan yalnız modeli söylüyordu. Uydurma bir
-- saat yazmak, öğretmenin hiç kurmadığı bir programı kurmuş gibi
-- gösterirdi ve Haftalık Akış bundan yanlış bir Son Teslim üretirdi.
-- Bu yüzden göç satırları PASİF gelir: öğretmen Hizmet Yapısını
-- Düzenle'de gün/saati girip aktifleştirir. Veri korunur, yalan üretilmez.
--
-- NOT: 'online_grup' ancak bir gruba bağlanabilir; grup bilgisi eski
-- alanda yok. Bu yüzden grup dersi olanlar birebir olarak DEĞİL, hiç
-- göç ettirilmez — CHECK'i uydurma bir grupla aşmak, olmayan bir grubu
-- var etmek olurdu. Öğretmen grubu kurup hizmeti kendisi tanımlar.
-- ============================================================
INSERT INTO public.student_services (
  workspace_id, student_id, kind, participation, medium,
  weekday, start_time, planned_duration_minutes, start_date,
  status, note
)
SELECT
  s.workspace_id,
  s.id,
  CASE WHEN s.lesson_type = 'bireysel_kocluk' THEN 'kocluk' ELSE 'ders' END,
  'birebir',
  CASE WHEN s.lesson_type = 'yuz_yuze_ozel' THEN 'yuz_yuze' ELSE 'online' END,
  1,                      -- yer tutucu; hizmet pasif olduğu için okunmaz
  '00:00'::TIME,          -- yer tutucu
  60,
  COALESCE(s.created_at::DATE, CURRENT_DATE),
  'passive',
  'Eski Çalışma Modeli alanından taşındı (074). Gün ve saat girilince aktifleştirin.'
FROM public.students s
WHERE s.lesson_type IN ('yuz_yuze_ozel', 'online_birebir', 'bireysel_kocluk')
  AND NOT EXISTS (
    SELECT 1 FROM public.student_services ss WHERE ss.student_id = s.id
  );
