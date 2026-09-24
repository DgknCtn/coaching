-- ============================================================
-- 108 — RLS YARDIMCILARI ANON'A AÇIK OLMAK ZORUNDA (R8 · üretime hazırlık)
--
-- ============================================================
-- BULGU: ANON'UN HER SORGUSU 42501 VERİYOR
--
-- 107 uygulandıktan sonra sağlık kontrolü (/api/health) "degraded"
-- dönmeye başladı. Sebep sağlık kontrolü değildi; anon anahtarla
-- yapılan EN BASİT sorgu bile patlıyordu:
--
--   GET /rest/v1/students?select=id&limit=1
--   {"code":"42501","message":"permission denied for function my_workspace_ids"}
--
-- ============================================================
-- BU 107'NİN GETİRDİĞİ BİR GERİLEME DEĞİL — 092'DEN BERİ VAR
--
-- 091, `my_workspace_ids`'i tanımlarken `REVOKE ALL ... FROM PUBLIC`
-- yaptı ve yalnız `authenticated`'a EXECUTE verdi. `anon` rolü PUBLIC
-- üyesi olduğu için o gün EXECUTE hakkını kaybetti.
--
-- O sırada fonksiyon tek bir tabloda deneniyordu, etkisi görünmedi.
-- 092 deseni 75 POLİTİKAYA yayınca, anon oturumundaki her sorgu o
-- politikaları değerlendirmek zorunda kaldı ve değerlendiremedi.
--
-- Canlıdan okunan tablo (24 Eylül 2026) tutarsızlığı tek bakışta
-- gösteriyor — RLS'ten çağrılan yardımcıların TAMAMI anon'a açıkken
-- yalnız bu ikisi kapalıydı:
--
--   current_profile_id      anon: EVET
--   has_workspace_role      anon: EVET
--   is_workspace_member     anon: EVET
--   is_student_self         anon: EVET
--   is_parent_of_student    anon: EVET
--   workspace_access_ok     anon: EVET
--   my_workspace_ids        anon: HAYIR   <-- 75 politika bunu çağırıyor
--   my_member_workspace_ids anon: HAYIR   <-- 107 aynı deseni kopyaladı
--
-- ============================================================
-- BU, DENETİMDEKİ 42501'LERİN MUHTEMEL KAYNAĞI
--
-- Dış denetim "62 Postgres hatası, 42501" raporlamıştı ve biz bunu
-- "anon korunan tablolara çarpıyor" diye yorumlamıştık
-- (docs/production-readiness/baseline.md §3). Gerçek daha keskin:
-- anon, KORUNMAYAN tablolara (students, books, ...) dokunduğunda bile
-- 42501 alıyor — çünkü RLS politikası çalıştıramadığı bir fonksiyonu
-- çağırıyor.
--
-- Fark önemli: "yetkisiz erişim reddedildi" değil, "yetkili erişim
-- değerlendirilemedi". RLS'in işi satırı SÜZMEK; süzemediğinde sorgu
-- patlıyor ve boş sonuç yerine hata dönüyor.
--
-- ============================================================
-- NEDEN GÜVENLİ
--
-- Fonksiyon anon'da da çalışır ama HER ZAMAN BOŞ KÜME döner:
-- `current_profile_id()` oturumsuz çağrıda NULL'dır, `wm.profile_id =
-- NULL` hiçbir satırla eşleşmez. Yani anon fonksiyonu çağırabilir,
-- hiçbir şey öğrenemez.
--
-- Bu zaten `has_workspace_role`'un yıllardır taşıdığı duruş: koruma
-- fonksiyonun ÇAĞRILABİLİRLİĞİNDE değil, GÖVDESİNDE. Çağrılamaz hâle
-- getirmek güvenlik eklemiyor, yalnız hata üretiyor.
--
-- ============================================================
-- FAZ 2 İÇİN UYARI — BU DOSYANIN EN ÖNEMLİ SATIRI
--
-- Sıradaki iş, anon'un çağırabildiği ~155 SECURITY DEFINER fonksiyonunu
-- kapatmak. O toplu REVOKE, RLS POLİTİKALARINDAN ÇAĞRILAN YARDIMCILARI
-- KAPSAMAMALIDIR. Kapsasaydı yukarıdaki sekiz fonksiyonun tamamı anon'a
-- kapanır ve uygulamanın oturumsuz her sorgusu 42501'e dönerdi — giriş
-- sayfası, davet sayfası, sağlık kontrolü dahil.
--
-- İzin listesi bu yüzden iki kategoriden oluşacak:
--   1. Oturumsuz AKIŞLARIN çağırdıkları
--      (check_rate_limit, get_invitation_by_token, log_auth_event)
--   2. RLS POLİTİKALARININ çağırdıkları  <-- bu dosyanın konusu
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.my_workspace_ids(TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION public.my_member_workspace_ids(TEXT[]) TO anon;

-- PostgREST hangi rolün hangi fonksiyonu çağırabileceğini önbellekliyor;
-- bu satır olmadan değişiklik bir sonraki yeniden yüklemeye kadar
-- etkisiz görünür.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DOĞRULAMA — migration kendini denetler
--
-- Sessizce yanlış uygulanan bir düzeltme, hiç uygulanmamış olandan
-- kötüdür: sorun çözüldü sanılır.
-- ============================================================
DO $verify$
DECLARE
  v_eksik TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ')
  INTO v_eksik
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'my_workspace_ids', 'my_member_workspace_ids',
      'has_workspace_role', 'is_workspace_member', 'current_profile_id',
      'is_student_self', 'is_parent_of_student', 'workspace_access_ok'
    )
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_eksik IS NOT NULL THEN
    RAISE EXCEPTION '108 DOĞRULAMA: RLS yardımcısı anon''a kapalı -> %', v_eksik;
  END IF;

  RAISE NOTICE '108: RLS yardımcılarının tamamı anon tarafından çağrılabilir.';
END;
$verify$;

-- ============================================================
-- ROLLBACK
--   REVOKE EXECUTE ON FUNCTION public.my_workspace_ids(TEXT[]) FROM anon;
--   REVOKE EXECUTE ON FUNCTION public.my_member_workspace_ids(TEXT[]) FROM anon;
--   NOTIFY pgrst, 'reload schema';
--   (Not: geri alınırsa anon'un her sorgusu yeniden 42501 verir.)
-- ============================================================
