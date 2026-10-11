-- ============================================================
-- 144 — VELİ ONAYI TEYİDİ (canlıya alma, Faz 3.3)
--
-- Öğrenciler çoğunlukla reşit değil. Koç bir öğrenci için ilk kez
-- kullanıcı adı + PIN verirken (öğrenciye ya da veliye) velinin, öğrenci
-- verilerinin İZ'de işlenmesine onay verdiğini TEYİT eder. Teyidin zamanı
-- ve teyit eden koç öğrenci satırında saklanır; bir kez verilir.
--
-- Bu bir hukuki metin değil, kaydın kendisi: onayın içeriği aydınlatma
-- metninde (/gizlilik). Öğretmen öğrenci satırını zaten güncelleyebildiği
-- için (students RLS) yeni politika gerekmiyor; yazma uygulamadan,
-- öğretmenin oturumuyla yapılır.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS guardian_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guardian_consent_by_profile_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.students.guardian_consent_at IS
  'Koçun, velinin veri işleme onayını teyit ettiği an (144). NULL: teyit yok.';
