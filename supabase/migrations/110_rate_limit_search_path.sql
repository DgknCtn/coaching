-- ============================================================
-- 110 — HIZ SINIRI FİİLEN ÇALIŞMIYORDU (R8 · üretime hazırlık)
--
-- ============================================================
-- BULGU
--
-- 109'un doğrulaması sırasında anon ile `check_rate_limit` çağrıldı ve
-- yetki hatası değil, şu döndü:
--
--   {"code":"42883",
--    "message":"function digest(text, unknown) does not exist"}
--
-- 42883 = undefined_function. Yani fonksiyon çağrılabiliyor ama
-- gövdesi çalışamıyor: `digest` `extensions` şemasında, oysa
-- `check_rate_limit`'in search_path'i yalnız `public, pg_temp` (068:192).
--
-- ============================================================
-- BU 109'UN GETİRDİĞİ BİR ŞEY DEĞİL — 068'DEN BERİ BÖYLE
--
-- Kanıt canlıdan okundu:
--
--   log_auth_event        search_path=public, pg_temp, extensions
--   check_rate_limit      search_path=public, pg_temp          <-- eksik
--
-- Aynı kusur `log_auth_event`'te de vardı ve `093:52` onu düzeltti;
-- `check_rate_limit` o turda gözden kaçtı.
--
-- İkinci kanıt uygulama logunda: bu oturumun EN BAŞINDA, 109'dan
-- saatler önce, her giriş denemesinde şu satır yazılıyordu:
--
--   [reportError] {"message":"Hız sınırı sayacı çalışmadı; istek geçirildi.",
--                  "scope":"rate-limit","action":"login"}
--
-- ============================================================
-- NEDEN SESSİZ KALDI — VE NEDEN ÖNEMLİ
--
-- `lib/rate-limit.ts` bilinçli olarak FAIL-OPEN: "Sayaç altyapısı
-- bozulursa istek ENGELLENMEZ, loglanır: kimsenin giriş yapamaması hız
-- sınırının olmamasından kötü bir arızadır." (050'nin kararı.)
--
-- O karar doğru. Ama sonucu şu: hız sınırı iki aydır hiç çalışmıyordu
-- ve ürün bunu yalnız bir log satırıyla söylüyordu. Giriş, kayıt, şifre
-- sıfırlama ve davet kabulünde kaba kuvvet koruması FİİLEN YOKTU —
-- 050'nin var olma sebebinin tamamı.
--
-- Dış denetim bunu görmedi: fonksiyon var, yetkileri doğru, tablo
-- yerinde. Yalnız çalışmıyor.
--
-- ============================================================
-- ÇÖZÜM: GÖVDEYE DOKUNULMUYOR
--
-- `ALTER FUNCTION ... SET search_path` kullanılıyor — 024'ün deseni.
-- Fonksiyonun mantığı hiç ellenmiyor, yalnız yapılandırması değişiyor.
-- Yeniden tanımlamak (093'ün yolu) gövdeyi kopyalamayı gerektirirdi ve
-- kopyalanan gövde ayrışabilir.
--
-- `extensions` search_path'in SONUNA ekleniyor: `public` önce gelmeye
-- devam ediyor, yani extensions şemasındaki bir nesnenin public'teki
-- bir nesneyi gölgelemesi mümkün değil. 024'ün gölgeleme kaygısı
-- korunuyor.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

ALTER FUNCTION public.check_rate_limit(TEXT, TEXT)
  SET search_path = public, pg_temp, extensions;

-- ============================================================
-- DOĞRULAMA — migration kendini denetler
--
-- pgcrypto kullanan her SECURITY DEFINER fonksiyonu `extensions`
-- görmeli. Bugün ikisi var (check_rate_limit, log_auth_event); üçüncüsü
-- eklenip search_path'i unutulursa bu blok onu da yakalar.
-- ============================================================
DO $verify$
DECLARE
  v_eksik TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
  INTO v_eksik
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    -- Gövdesinde pgcrypto çağrısı geçenler
    AND pg_get_functiondef(p.oid) ~ '\mdigest\s*\('
    -- ama search_path'inde extensions olmayanlar
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) AS c
      WHERE c LIKE 'search\_path=%' AND c LIKE '%extensions%'
    );

  IF v_eksik IS NOT NULL THEN
    RAISE EXCEPTION
      '110 DOĞRULAMA: pgcrypto kullanan fonksiyon extensions görmüyor -> %',
      v_eksik;
  END IF;

  RAISE NOTICE '110: pgcrypto kullanan fonksiyonların search_path''i doğru.';
END;
$verify$;

-- ============================================================
-- ROLLBACK
--   ALTER FUNCTION public.check_rate_limit(TEXT, TEXT)
--     SET search_path = public, pg_temp;
--   (Not: geri alınırsa hız sınırı yeniden sessizce devre dışı kalır.)
-- ============================================================
