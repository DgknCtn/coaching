-- ============================================================
-- 111 — FK İNDEKS TRİYAJI: 70 ADAYDAN 4'Ü (R8 · PERF-01)
--
-- ============================================================
-- NEDEN HEPSİ DEĞİL
--
-- Dış denetim 156 yabancı anahtardan 70'ini "olası eksik indeks" diye
-- işaretledi ve kendi uyarısını da yazdı:
--
--   "Adding all flagged indexes would be poor practice: each candidate
--    should be justified by join/filter/delete/update patterns."
--
-- Her indeks bir maliyet: yazma başına güncellenir, disk tutar,
-- planlayıcıyı meşgul eder. Gerekçesiz indeks, çözdüğünden çok sorun
-- üretir.
--
-- ============================================================
-- 66 ADAY NEDEN ELENDİ
--
-- 1) "KİM YAPTI" KOLONLARI (yaklaşık 40 tanesi).
--    approved_by_profile_id, completed_by_profile_id,
--    submitted_by_profile_id, created_by_profile_id, author_profile_id,
--    assigned_by_profile_id, reverted_by_profile_id...
--
--    Uygulama kodunda bu kolonlar üzerinden TEK BİR filtre yok
--    (doğrulandı: `eq('*_by_profile_id')` araması boş döndü). Kayıt
--    tutuyorlar, sorgulanmıyorlar. Tek tetikleyicileri bir profilin
--    silinmesi — ki o da ON DELETE SET NULL ile ve çok nadir.
--
-- 2) SIFIR VE ÇOK KÜÇÜK TABLOLAR.
--    group_sessions (0 satır), topic_contacts (0), video_watch_marks
--    (0), homework_item_notes (1), student_topic_overrides (1),
--    student_personal_items (7), partner_commissions (2)...
--
--    Denetimin kendi notu: "Sequential scans on very small tables can
--    be optimal." Tek sayfalık bir tabloda indeks aramak, tabloyu
--    doğrudan okumaktan yavaştır.
--
-- 3) ZATEN BİLEŞİK İNDEKSİN BAŞINDA OLANLAR.
--    Sorgu bu dosyada `indkey[0]` ile yapıldı: yalnız indeksin İLK
--    kolonu sayılıyor, çünkü PostgreSQL bileşik indeksi ancak baştan
--    kullanabiliyor.
--
-- ============================================================
-- KALAN 4 ADAYIN GEREKÇESİ
--
-- Ölçüm: canlı `pg_stat_user_tables` (24 Eylül 2026) + uygulama
-- kodunda gerçek kullanım araması.
-- ============================================================

-- ------------------------------------------------------------
-- 1) homework_items (book_id) ve (section_id)
--
-- 1.429 satır, 1.626.713 indeks taraması — uygulamanın en sık okunan
-- tablolarından biri.
--
-- PostgREST gömülü ilişkileri bu FK'ler üzerinden çözüyor:
--
--   app/(dashboard)/student/haftam/page.tsx:91-92
--     books(id, title, tracking_mode), book_sections(id, title, ...)
--   app/(dashboard)/student/page.tsx:43
--
-- Yani her Haftam ve Ödevlerim yüklemesi bu iki yoldan geçiyor. Ödev
-- kalemleri öğrenci başına yüzlerce satıra çıkıyor (100+ çalışmalık
-- hafta belgenin kabul testinde var), yani veri büyüdükçe fark açılır.
--
-- YAZMA MALİYETİ KABUL EDİLDİ: homework_items'a toplu INSERT oluyor
-- (ödev yayınlama). Ama okuma/yazma oranı buna fazlasıyla izin veriyor:
-- 1,6 milyon indeks taramasına karşı 1.690 sıralı tarama.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_homework_items_book
  ON public.homework_items (book_id);

CREATE INDEX IF NOT EXISTS idx_homework_items_section
  ON public.homework_items (section_id);

-- ------------------------------------------------------------
-- 2) student_curriculum_items (workspace_id)
--
-- 379 satır ama 1.310 SIRALI TARAMA — listedeki en yüksek seq_scan
-- oranı.
--
-- `workspace_id` burada sıradan bir FK değil: RLS politikasının
-- doğrudan süzdüğü kolon (`workspace_id IN (SELECT my_workspace_ids(...))`).
-- Yani bu tabloya yapılan HER sorgu, her satır için bu kolona bakıyor.
-- İndeks yoksa RLS'in kendisi sıralı tarama demek.
--
-- Kullanım: lib/book-map.ts:264, lib/protection-pool-rows.ts:58 —
-- kitap haritası ve koruma havuzu ekranları.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_student_curriculum_items_workspace
  ON public.student_curriculum_items (workspace_id);

-- ------------------------------------------------------------
-- 3) curriculum_template_items (workspace_id)
--
-- 952 satır — indekssiz tablolar içinde en büyüğü. Yine RLS'in
-- süzdüğü kolon.
--
-- Müfredat şablonları öğrenciye uygulanırken toplu okunuyor
-- (assign_curriculum_template). Şablon kalemleri konu sayısıyla
-- ölçeklendiği için bu tablo büyümeye en açık olanlardan.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_curriculum_template_items_workspace
  ON public.curriculum_template_items (workspace_id);

-- ============================================================
-- DOĞRULAMA
--
-- Migration, hedeflediği dört indeksin gerçekten oluştuğunu denetler.
-- "IF NOT EXISTS" sessizce atlayabilir; sessiz atlama, uygulandığı
-- sanılan bir değişikliğin en kolay yoludur.
-- ============================================================
DO $verify$
DECLARE
  v_eksik TEXT;
BEGIN
  SELECT string_agg(beklenen, ', ')
  INTO v_eksik
  FROM (
    VALUES
      ('idx_homework_items_book'),
      ('idx_homework_items_section'),
      ('idx_student_curriculum_items_workspace'),
      ('idx_curriculum_template_items_workspace')
  ) AS t(beklenen)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = t.beklenen
  );

  IF v_eksik IS NOT NULL THEN
    RAISE EXCEPTION '111 DOĞRULAMA: indeks oluşmadı -> %', v_eksik;
  END IF;

  RAISE NOTICE '111: dört FK indeksi yerinde.';
END;
$verify$;

-- ============================================================
-- SONRAKİ ADIM — BU DOSYA SON SÖZ DEĞİL
--
-- Karar, 62 günlük KÜMÜLATİF istatistiklerle verildi ve o pencere
-- 091/092 optimizasyonundan öncesini de kapsıyor. Kalan 66 aday
-- "gereksiz" diye kapatılmadı; "bugünkü veriyle gerekçesi yok" diye
-- bekletildi.
--
-- Doğru sıra: `pg_stat_reset()` -> temsilî bir kullanım penceresi ->
-- yeniden ölçüm. O zaman hem bu dördünün gerçekten kullanıldığı
-- (`pg_stat_user_indexes.idx_scan > 0`) hem de yeni adayların olup
-- olmadığı görülür.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- ROLLBACK
--   DROP INDEX IF EXISTS public.idx_homework_items_book;
--   DROP INDEX IF EXISTS public.idx_homework_items_section;
--   DROP INDEX IF EXISTS public.idx_student_curriculum_items_workspace;
--   DROP INDEX IF EXISTS public.idx_curriculum_template_items_workspace;
-- ============================================================
