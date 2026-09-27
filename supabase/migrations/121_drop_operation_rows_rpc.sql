-- ============================================================
-- 121 — 117 GERİ ALINDI: teacher_operation_rows kaldırılıyor
--
-- 117 panel sorgusunu, planı saklansın diye bir plpgsql fonksiyonuna
-- almıştı. Varsayım yanlıştı: PostgREST sorguları zaten hazırlanmış ifade
-- olarak çalıştırıyor, yani plan bağlantı başına zaten saklanıyordu.
-- SQL Editor'deki EXPLAIN'de görülen ~18 ms planlama yalnız o tek seferlik
-- sorguya aitti. Canlı ölçüm (27 Eylül, 15 tekrar ortancası):
--
--   A · view 96 ms   · fonksiyon 91 ms
--   B · view 121 ms  · fonksiyon 118 ms     -> gürültü düzeyinde
--
-- Kazanç yokken fonksiyon bir risk taşıyordu: view `DROP ... CASCADE`
-- ile yeniden kurulduğunda fonksiyon da düşer. Uygulama view'a döndü;
-- fonksiyon kaldırılıyor.
-- ============================================================

DROP FUNCTION IF EXISTS public.teacher_operation_rows(UUID);

DO $dogrula$
BEGIN
  IF to_regprocedure('public.teacher_operation_rows(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION '121 DOĞRULAMA: fonksiyon hâlâ duruyor.';
  END IF;
  RAISE NOTICE '121: teacher_operation_rows kaldırıldı.';
END;
$dogrula$;
