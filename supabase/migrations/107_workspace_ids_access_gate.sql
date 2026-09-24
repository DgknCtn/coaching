-- ============================================================
-- 107 — DENEME/LİSANS KAPISI RLS'E GERİ DÖNÜYOR (R8 · üretime hazırlık)
--
-- ============================================================
-- SORUN
--
-- 092, performans için 92 RLS politikasını mekanik olarak çevirdi:
--
--   (SELECT has_workspace_role(X, R))  ->  X IN (SELECT my_workspace_ids(R))
--
-- Ölçüm gerçekti ve kazanç büyüktü (profiles taramaları %41 düştü,
-- /teacher 3.298ms -> 1.115ms). Ama iki fonksiyon AYNI ŞEYİ SORMUYOR:
--
--   has_workspace_role = aktif üyelik  VE  workspace_access_ok(ws)
--   my_workspace_ids   = aktif üyelik                    (kapı YOK)
--
-- `workspace_access_ok` (058:442-461) şunu soruyor: çalışma alanı aktif
-- mi VE (denemesi sürüyor mu / geçerli lisansı var mı / devralınan bir
-- plan mı). 092 bu soruyu 75 politikadan düşürdü.
--
-- 091'in kendi başlığı sözleşmeyi zaten yazmıştı:
--   "Biri değişirse diğeri de değişmeli — ayrışırlarsa aynı soruya iki
--    farklı cevap veren iki yol oluşur."
-- 092 o cümleyi yalanladı.
--
-- ============================================================
-- BUGÜNKÜ HÂL — KAPI KALKMADI, PARÇALANDI VE DAĞILIM TERS
--
-- Canlıdan okundu (24 Eylül 2026, toplam 99 politika):
--
--   my_workspace_ids     75 politika   kapı YOK
--   is_workspace_member   3 politika   kapı var
--   has_workspace_role    2 politika   kapı var
--
-- Yani süresi dolmuş bir kiracı kendi `workspaces` satırını göremiyor
-- ama ÖĞRENCİ, ÖDEV ve FİNANS verisini görebiliyor. Hassas olan açık,
-- önemsiz olan kapalı.
--
-- Geriye kalan tek koruma uygulama katmanı: lib/workspace.ts:40 ->
-- /erisim yönlendirmesi. Yani ARAYÜZ. Geçerli bir JWT ile doğrudan
-- PostgREST'e giden bir istek o yönlendirmeyi hiç görmez.
--
-- Deneme süresi 099'da 7 günden 3 güne indi; bu durum artık çok daha
-- sık yaşanacak.
--
-- ============================================================
-- ÇÖZÜM: KURAL KOPYALANMIYOR, DEVREDİLİYOR
--
-- `workspace_access_ok` koşullarını buraya elle yazmak aynı hatayı
-- üçüncü kez kurardı. Tek yardımcıya devrediliyor; kural değişirse tek
-- yerde değişir.
--
-- POLİTİKALARA DOKUNULMUYOR: 092'nin 75 politikası olduğu gibi kalıyor,
-- yalnız çağırdıkları fonksiyonun gövdesi değişiyor. Kazanç korunuyor
-- çünkü alt sorgu hâlâ satırın sütununa BAĞLI DEĞİL — korelasyonsuz
-- alt sorgu InitPlan olur, sorgu başına bir kez çalışır.
--
-- MALİYET ÖLÇÜLECEK, VARSAYILMAYACAK: `workspace_licenses` bugün 2
-- satırlık bir tablo ama 62 günlük pencerede 18,2 milyon indeks
-- taraması almış (kaynak: RPC gövdelerindeki has_workspace_role).
-- Kapıyı 75 politikaya bağlamak bu sayıyı artırabilir. Uygulama sonrası
-- EXPLAIN ve sayfa süreleri karşılaştırılacak; `loops=1` görülmezse
-- değişiklik geri alınacak.
--
-- ============================================================
-- TİCARİ TABLOLAR MUAF — YOKSA KİRACI YENİLEME YAPAMAZ
--
-- `billing_orders` ve `workspace_licenses` doğrudan PostgREST ile
-- okunuyor (ayarlar/abonelik/page.tsx:102, kurulum/odeme/page.tsx:16).
-- Bunlara kapı koymak, süresi dolmuş kiracıyı TAM DA YENİLEMEK İÇİN
-- görmesi gereken satırlardan kilitlerdi: lisansı bitmiş kullanıcı
-- ödeme geçmişini ve mevcut lisansını göremeden yenileyemez.
--
-- Bu yüzden kapısız bir ikiz ekleniyor ve YALNIZ o iki politika ona
-- bağlanıyor. Adı bilerek açık: "member" = yalnız üyelik, kapı yok.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 1) my_member_workspace_ids — KAPISIZ ikiz (yalnız ticari tablolar)
--
-- Gövde, 091'deki my_workspace_ids'in bugünkü hâlinin birebir aynısı.
-- Ayrı bir ad taşıyor ki "kapı unutulmuş" sanılmasın: burada kapının
-- YOKLUĞU kasıtlıdır ve sebebi yukarıda yazılı.
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_member_workspace_ids(p_roles TEXT[])
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.profile_id = public.current_profile_id()
    AND wm.role       = ANY(p_roles)
    AND wm.status     = 'active'
    AND w.status      = 'active';
$$;

REVOKE ALL ON FUNCTION public.my_member_workspace_ids(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_member_workspace_ids(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_member_workspace_ids(TEXT[]) TO authenticated;

-- ============================================================
-- 2) my_workspace_ids — KAPI GERİ EKLENİYOR
--
-- Tek değişiklik son satır. 75 politika bu fonksiyonu çağırdığı için
-- kapı tek hamlede hepsine geri geliyor.
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_workspace_ids(p_roles TEXT[])
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.profile_id = public.current_profile_id()
    AND wm.role       = ANY(p_roles)
    AND wm.status     = 'active'
    AND w.status      = 'active'
    -- 092'de düşen koşul. has_workspace_role ile tek kaynağa bağlanır.
    AND public.workspace_access_ok(w.id);
$$;

REVOKE ALL ON FUNCTION public.my_workspace_ids(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_workspace_ids(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_workspace_ids(TEXT[]) TO authenticated;

-- ============================================================
-- 3) Ticari tabloların politikaları kapısız ikize bağlanıyor
--
-- 092'deki tanımların aynısı; değişen yalnız çağrılan fonksiyon.
-- ============================================================
DROP POLICY IF EXISTS "billing_orders_select" ON public.billing_orders;
CREATE POLICY "billing_orders_select" ON public.billing_orders
  FOR SELECT
  USING (workspace_id IN (SELECT public.my_member_workspace_ids(ARRAY['owner'::text])));

DROP POLICY IF EXISTS "workspace_licenses_select" ON public.workspace_licenses;
CREATE POLICY "workspace_licenses_select" ON public.workspace_licenses
  FOR SELECT
  USING (workspace_id IN (SELECT public.my_member_workspace_ids(ARRAY['owner'::text])));

-- ============================================================
-- 4) 101'in iki öğretmen politikası aynı desene çekiliyor
--
-- 101, 092'den SONRA yazıldı ve has_workspace_role kullanıyordu —
-- yani kapı oradaydı ama komşu 75 politikada yoktu. Artık hepsi aynı
-- yoldan geçiyor: aynı soruya tek cevap.
--
-- ÖĞRENCİ POLİTİKALARINA DOKUNULMUYOR: is_student_self satırın KENDİ
-- id'sini alıyor, satır başına değerlendirilmesi tasarımın kendisi
-- (088'in bıraktığı yerde kalıyor).
-- ============================================================
DROP POLICY IF EXISTS day_notes_select_teacher ON public.student_day_notes;
CREATE POLICY day_notes_select_teacher ON public.student_day_notes
  FOR SELECT
  USING (workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

DROP POLICY IF EXISTS item_notes_select_teacher ON public.homework_item_notes;
CREATE POLICY item_notes_select_teacher ON public.homework_item_notes
  FOR SELECT
  USING (workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ============================================================
-- 5) DOĞRULAMA — migration kendini denetler
--
-- NOTICE'a güvenilmez: sessizce yanlış uygulanan bir güvenlik
-- migration'ı, hiç uygulanmamış olandan kötüdür çünkü kapatıldığı
-- sanılır.
-- ============================================================
DO $verify$
DECLARE
  v_gate_missing BOOLEAN;
  v_exempt       INT;
BEGIN
  SELECT position('workspace_access_ok' in pg_get_functiondef(p.oid)) = 0
  INTO v_gate_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'my_workspace_ids';

  IF v_gate_missing IS NOT FALSE THEN
    RAISE EXCEPTION '107 DOĞRULAMA: my_workspace_ids hâlâ kapısız.';
  END IF;

  SELECT count(*) INTO v_exempt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('billing_orders', 'workspace_licenses')
    AND qual LIKE '%my_member_workspace_ids%';

  IF v_exempt <> 2 THEN
    RAISE EXCEPTION '107 DOĞRULAMA: ticari muafiyet eksik (% politika).', v_exempt;
  END IF;

  RAISE NOTICE '107: kapı geri eklendi, ticari tablolar muaf.';
END;
$verify$;

-- ============================================================
-- ROLLBACK
--   091'deki my_workspace_ids gövdesini (workspace_access_ok satırı
--   olmadan) yeniden uygula; 092'deki billing_orders_select ve
--   workspace_licenses_select tanımlarını geri yaz; 101'deki iki
--   politikayı has_workspace_role hâline döndür; ardından:
--   DROP FUNCTION IF EXISTS public.my_member_workspace_ids(TEXT[]);
-- ============================================================
