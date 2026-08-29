-- ============================================================
-- 033_student_prep_program  (R6-11)
--
-- Öğrencinin MEVCUT AKADEMİK DURUMU ile NEYE HAZIRLANDIĞI birbirine
-- karışıyordu. "Sınav Türü + Sınıf" kombinasyonu ekranda yanlış
-- çağrışımlar üretiyor: 9. Sınıf + AYT, "9. sınıf AYT öğrencisi" gibi
-- okunuyor. Oysa bunlar bağımsız iki bilgidir:
--
--   Sınıf/Durum      -> öğrenci şu an nerede    (9-12, Mezun, Diğer)
--   Hazırlık Programı -> neye hazırlanıyor       (YKS, LGS, IB, SAT, ...)
--
-- DEĞİŞEN: students.exam_type CHECK kısıtı. Kolon adı KORUNUR — yeniden
-- adlandırmak, okuyan onlarca sorgu/ekran için bedeli olan ama karşılığı
-- olmayan bir değişiklik olurdu. Kullanıcıya görünen etiket uygulama
-- katmanında "Hazırlık Programı"dır (lib/validation.ts).
--
-- ESKİ DEĞERLER KORUNUR: TYT, AYT, LGS, KPSS, DGS, Other hâlâ geçerli.
-- Bu yüzden mevcut hiçbir satır kısıtı ihlal etmez ve veri dönüşümü
-- GEREKMEZ — yalnız kabul edilen küme genişler.
--
-- İKİ ALAN BİRBİRİNİ KISITLAMAZ: 9. Sınıf + YKS ya da 10. Sınıf + IB
-- serbesttir (kabul #63, #64). Backend'de çapraz doğrulama yoktur ve
-- eklenmemelidir.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu. Geri almadan ÖNCE yeni
-- değerlerle kaydedilmiş satırların bulunup bulunmadığı kontrol edilmeli
-- (sorgu ROLLBACK bloğunda), aksi halde eski CHECK eklenemez.
-- ============================================================

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_exam_type_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_exam_type_check
  CHECK (exam_type IS NULL OR exam_type IN (
    -- Eskiden beri geçerli olanlar
    'TYT', 'AYT', 'LGS', 'KPSS', 'DGS', 'Other',
    -- R6-11 ile eklenenler
    'Yok', 'YKS', 'IB', 'SAT', 'AP', 'ALES', 'Diğer'
  ));

COMMENT ON COLUMN public.students.exam_type IS
  'R6-11: kullanıcıya "Hazırlık Programı" olarak gösterilir. Kolon adı '
  'geriye dönük uyum için korunmuştur. grade_level ile aralarında '
  'kısıtlama YOKTUR: 9. Sınıf + YKS geçerli bir kombinasyondur.';

-- ============================================================
-- ROLLBACK
--
--   -- 1) Yeni değerlerle kayıtlı satır var mı?
--   SELECT id, full_name, exam_type FROM public.students
--   WHERE exam_type IN ('Yok', 'YKS', 'IB', 'SAT', 'AP', 'ALES', 'Diğer');
--
--   -- 2) Varsa önce onları eski kümeye taşıyın (ör. NULL veya 'Other'),
--   --    sonra eski kısıtı geri koyun:
--   ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_exam_type_check;
--   ALTER TABLE public.students
--     ADD CONSTRAINT students_exam_type_check
--     CHECK (exam_type IN ('TYT', 'AYT', 'LGS', 'KPSS', 'DGS', 'Other'));
-- ============================================================
