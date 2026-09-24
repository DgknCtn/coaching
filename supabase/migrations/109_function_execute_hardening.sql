-- ============================================================
-- 109 — ANON'UN ÇAĞIRABİLDİĞİ FONKSİYON YÜZEYİ DARALTILIYOR
--       (R8 · üretime hazırlık · SEC-02)
--
-- ============================================================
-- SORUN
--
-- Canlıdan okundu (24 Eylül 2026):
--
--   public şemasında fonksiyon            165
--   SECURITY DEFINER                      158
--   anon'un ÇAĞIRABİLDİĞİ                 155
--
-- Dış denetim bu sayıyı 97 sanmıştı; gerçek daha kötü.
--
-- Sebep PostgreSQL'in varsayılanı: bir fonksiyon oluşturulduğunda
-- EXECUTE hakkı PUBLIC'e verilir. Depoda 101 adet
-- `GRANT EXECUTE ... TO authenticated` var ama yalnız 32 fonksiyonda
-- `REVOKE ... FROM PUBLIC` bulunuyor. `GRANT TO authenticated` yazmak
-- anon'u ENGELLEMEZ — yalnız zaten sahip olduğu hakkı tekrarlar.
--
-- Bugün sömürülebilirlik düşük: gövdeler `current_profile_id()` /
-- `has_workspace_role()` kontrol ediyor ve anon oturumunda `auth.uid()`
-- NULL. Ama bu, savunmanın TEK KATMANA bırakılmış olması demek:
-- gövdesinde kontrol unutulan ilk fonksiyon doğrudan dışarı açılır.
--
-- ============================================================
-- İZİN LİSTESİ NEDEN DİNAMİK
--
-- İlk tasarımda izin listesi elle yazılacaktı. Canlıya sorulduğunda
-- elle listede OLMAYAN beş fonksiyon çıktı:
--
--   can_read_library, can_read_student, current_partner_id,
--   is_library_workspace, student_workspace_matches
--
-- Beşi de RLS politikalarından çağrılıyor. Elle liste yazılsaydı bu beş
-- fonksiyon anon'a kapanır ve ilgili tablolara yapılan HER oturumsuz
-- sorgu 42501 verirdi — tam olarak 108'de düzeltilen kusurun aynısı,
-- beş kat büyüğü.
--
-- Bu yüzden muafiyet `pg_policies` üzerinden TÜRETİLİYOR: bir fonksiyon
-- herhangi bir politika ifadesinde geçiyorsa dokunulmuyor. Gelecekte
-- eklenecek bir politika yardımcısı da kendiliğinden korunur.
--
-- NEDEN POLİTİKADAN ÇAĞRILANLAR AÇIK KALMAK ZORUNDA
--
-- Politika ifadesi, sorguyu yapan ROLÜN bağlamında değerlendirilir.
-- Anon o fonksiyonu çağıramazsa RLS satırı süzemez ve sorgu patlar:
-- "yetkisiz erişim reddedildi" değil, "yetkili erişim
-- DEĞERLENDİRİLEMEDİ" (108'in konusu).
--
-- Fonksiyon GÖVDESİNDEN yapılan çağrılar için bu geçerli DEĞİL:
-- SECURITY DEFINER içinden yapılan çağrı sahibin haklarıyla çalışır.
-- Bu yüzden `workspace_access_ok` gibi yalnız gövdeden çağrılanlar
-- listede yok ve kapatılabilir.
--
-- ============================================================
-- OTURUMSUZ AKIŞLAR — ELLE VE KANITLI
--
--   check_rate_limit         lib/rate-limit.ts:91      giriş/kayıt ÖNCESİ
--   get_invitation_by_token  app/invite/[token]/page.tsx:37  oturumsuz sayfa
--   log_auth_event           lib/auth-audit.ts:73      BAŞARISIZ girişte de yazar
--
-- `check_rate_limit`'in İKİ İMZASI var (050 ve 068); liste bu yüzden
-- ada göre, imzaya göre değil.
--
-- `accept_invitation` bilerek listede YOK. 007'de anon'a açılmıştı ama
-- app/invite/[token]/actions.ts:59 çağrılmadan önce her yolda oturum
-- var: signUp oturum döndürmezse kod signInWithPassword'e düşüyor,
-- o da başarısızsa erken dönüyor. Kod kanıtı kesin; yine de uygulama
-- sonrası davet akışı elle denenecek.
--
-- ============================================================
-- TETİKLEYİCİLER
--
-- PostgreSQL tetikleyici fonksiyonunda EXECUTE'u İŞLEMİ YAPAN
-- kullanıcıya karşı denetler. PUBLIC'ten alıp authenticated'a geri
-- vermemek, tetikleyicisi olan her INSERT'i kırardı. Döngü ayrım
-- yapmadan authenticated'a veriyor — zekice olandan güvenli olan
-- seçiliyor.
--
-- ============================================================
-- service_role'A DOKUNULMUYOR
--
-- `REVOKE ... FROM PUBLIC` açık grant'ları etkilemez ve Supabase
-- service_role'a kendi varsayılanlarıyla EXECUTE veriyor. Ödeme
-- callback'i (app/api/billing/callback) ve cron (api/cron/...) buna
-- bağlı.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

DO $harden$
DECLARE
  r            RECORD;
  v_kapatilan  INT := 0;
  -- Oturumsuz akışların çağırdıkları. ADA GÖRE: check_rate_limit'in
  -- iki imzası var ve ikisi de açık kalmalı.
  k_anon_akis  TEXT[] := ARRAY[
    'check_rate_limit',
    'get_invitation_by_token',
    'log_auth_event'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'                       -- toplam/pencere fonksiyonları hariç
      AND NOT (p.proname = ANY(k_anon_akis))
      -- RLS POLİTİKALARINDAN ÇAĞRILANLAR DOKUNULMAZ (yukarıdaki gerekçe).
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND (
            COALESCE(pol.qual, '')       LIKE '%' || p.proname || '(%'
            OR COALESCE(pol.with_check, '') LIKE '%' || p.proname || '(%'
          )
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    v_kapatilan := v_kapatilan + 1;
  END LOOP;

  RAISE NOTICE '109: % fonksiyon anon''a kapatıldı.', v_kapatilan;
END;
$harden$;

-- ============================================================
-- GELECEKTEKİ FONKSİYONLAR
--
-- Bu satırlar olmadan migration her yeni fonksiyondan sonra tekrar
-- çalıştırılmak zorunda kalırdı. Varsayılan yetkiler OLUŞTURAN ROLE
-- göre tanımlı olduğu için `FOR ROLE postgres` biçimi de yazılıyor
-- (Supabase SQL düzenleyicisinin çalıştığı rol).
--
-- Tam garanti değil: panelden başka bir rolle açılan fonksiyon kaçar.
-- Bu yüzden aşağıdaki doğrulama ve tests/function-grants.test.ts var.
-- ============================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- PostgREST hangi rolün hangi fonksiyonu çağırabileceğini önbelleğinde
-- tutuyor; bu satır olmadan REVOKE bir sonraki yeniden yüklemeye kadar
-- ETKİSİZ GÖRÜNÜR.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DOĞRULAMA — migration kendini denetler
--
-- NOTICE'a güvenilmez. Sessizce yarım uygulanan bir güvenlik
-- migration'ı, hiç uygulanmamış olandan kötüdür: kapatıldığı sanılır.
--
-- Sonda `has_function_privilege` kullanılıyor, `proacl` DEĞİL:
-- proacl NULL olduğunda "varsayılan" demektir ve varsayılan PUBLIC'e
-- EXECUTE'tur — yani 155 fonksiyonluk deliğin ta kendisi proacl
-- okumasıyla GÖRÜNMEZ.
-- ============================================================
DO $verify$
DECLARE
  v_sizinti TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
  INTO v_sizinti
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('check_rate_limit', 'get_invitation_by_token', 'log_auth_event')
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies pol
      WHERE pol.schemaname = 'public'
        AND (
          COALESCE(pol.qual, '')       LIKE '%' || p.proname || '(%'
          OR COALESCE(pol.with_check, '') LIKE '%' || p.proname || '(%'
        )
    );

  IF v_sizinti IS NOT NULL THEN
    RAISE EXCEPTION '109 DOĞRULAMA: anon hâlâ çağırabiliyor -> %', v_sizinti;
  END IF;

  RAISE NOTICE '109: anon yüzeyi yalnız oturumsuz akışlar ve RLS yardımcılarıyla sınırlı.';
END;
$verify$;

-- ============================================================
-- ROLLBACK
--   Aşağıdaki blok tüm public fonksiyonları eski (açık) hâline döndürür.
--   Yalnız acil durumda kullanılmalı: bu, 155 fonksiyonu yeniden anon'a
--   açmak demektir.
--
--   DO $rollback$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
--              JOIN pg_namespace n ON n.oid = p.pronamespace
--              WHERE n.nspname = 'public' AND p.prokind = 'f'
--     LOOP
--       EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.sig);
--     END LOOP;
--   END; $rollback$;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
