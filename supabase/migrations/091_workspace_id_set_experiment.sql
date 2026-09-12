-- ============================================================
-- 091 — RLS: korelasyonlu SubPlan yerine kümeye üyelik (KONTROLLÜ DENEY)
-- ============================================================
--
-- ÖNCE ÖLÇÜM, SONRA DEĞİŞİKLİK.
--
-- 088 politikalardaki `has_workspace_role(...)` çağrılarını
-- `(SELECT has_workspace_role(...))` hâline getirdi. Beklenen, planlayıcının
-- bunu InitPlan'a çevirip sorgu başına BİR KEZ çalıştırmasıydı. Uygulama
-- tarafında ölçülen kazanç ise marjinal kaldı: /teacher/students 6,9 sn'den
-- 7,3 sn'ye "iyileşti", yani hiç iyileşmedi.
--
-- Neden olduğu, sayaçları tek bir sayfa yüklemesinin ÖNCESİNDE ve
-- SONRASINDA okuyarak bulundu (pg_stat_user_tables):
--
--   /teacher/students — TEK yükleme, 8 saniye
--     profiles          13.462 tarama
--     workspace_members 13.373 tarama
--     homework_items     1.560 tarama
--     students              35 tarama   ← is_student_self SUÇLU DEĞİL
--
-- Yani has_workspace_role sayfa başına ~13.400 kez çağrılıyor. Sebep:
-- sarmalanan ifade satırın KENDİ sütununu alıyor
-- (`homework_items.workspace_id`). Satır sütununa bağlı bir alt sorgu
-- InitPlan OLMAZ — korelasyonlu SubPlan olur ve satır başına yeniden
-- çalışır. 088'in parantezi sözdizimsel olarak doğruydu ama planlayıcı
-- için hiçbir şey değiştirmedi.
--
-- ============================================================
-- ÇÖZÜM: KORELASYONU KALDIRMAK
-- ============================================================
-- `has_workspace_role(X, roller)` ile
-- `X IN (SELECT my_workspace_ids(roller))` MANTIKSAL OLARAK AYNI —
-- koşullar birebir aynı, yalnız yön değişiyor: "bu alan bana açık mı"
-- yerine "bana açık alanlar hangileri, bu onlardan biri mi".
--
-- Fark planlayıcı için: alt sorgu artık satırdan BAĞIMSIZ. InitPlan
-- olarak bir kez çalışıyor, sonucu küçük bir küme (kullanıcının üye
-- olduğu çalışma alanları — pratikte bir ya da iki tane) ve satır başına
-- yapılan iş bir hash aramasına iniyor.
--
-- ============================================================
-- NEDEN TEK TABLO: BU BİR DENEY
-- ============================================================
-- Aynı değişiklik 20'den fazla politikada yapılabilir ama HENÜZ
-- YAPILMIYOR. 088'in dersi tam da bu: makul görünen bir düzeltme
-- ölçülmeden yirmi yere uygulandı ve hiçbir şey değiştirmedi.
--
-- Burada yalnız `homework_items` değişiyor. Uygulandıktan sonra aynı
-- ölçüm tekrarlanacak: profiles/workspace_members tarama sayısı
-- düşmezse hipotez yanlıştır ve geri alınır. Düşerse aynı desen
-- kalanlara ayrı bir migration'la yayılır.
--
-- GÜVENLİK: hi_select'in mantığı değişmiyor. Öğretmen dalı kümeye
-- üyeliğe çevrildi; öğrenci/veli dalı OLDUĞU GİBİ duruyor.
--
-- Yeniden çalıştırılabilir.
-- ============================================================

-- ------------------------------------------------------------
-- my_workspace_ids — kullanıcının verilen rollerle üye olduğu alanlar
--
-- has_workspace_role ile AYNI KOŞULLAR: aktif üyelik, aktif çalışma
-- alanı (051'in askıya alma kontrolü), rol eşleşmesi. Biri değişirse
-- diğeri de değişmeli — ayrışırlarsa aynı soruya iki farklı cevap veren
-- iki yol oluşur ve bu, yetkilendirmede en tehlikeli durumdur.
-- ------------------------------------------------------------
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
    AND w.status      = 'active';
$$;

REVOKE ALL ON FUNCTION public.my_workspace_ids(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_workspace_ids(TEXT[]) TO authenticated;

-- ------------------------------------------------------------
-- homework_items — DENEY TABLOSU
--
-- Mantık, 091 öncesindeki hâliyle birebir aynı:
--   öğretmen dalı  : alanın üyesi mi
--   öğrenci/veli dalı: ödev paketi kendisine mi ait (DEĞİŞMEDİ)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "hi_select" ON public.homework_items;
CREATE POLICY "hi_select" ON public.homework_items
  FOR SELECT USING (
    homework_items.workspace_id IN (
      SELECT public.my_workspace_ids(ARRAY['owner', 'teacher', 'assistant'])
    )
    OR EXISTS (
      SELECT 1 FROM public.homework_batches hb
      WHERE hb.id = homework_items.homework_batch_id
        AND (
          public.is_student_self(hb.student_id)
          OR public.is_parent_of_student(hb.student_id)
        )
    )
  );

-- ============================================================
-- GERİ ALMA (deney başarısız olursa):
--
--   DROP POLICY IF EXISTS "hi_select" ON public.homework_items;
--   CREATE POLICY "hi_select" ON public.homework_items
--     FOR SELECT USING (
--       (SELECT public.has_workspace_role(homework_items.workspace_id,
--          ARRAY['owner', 'teacher', 'assistant']))
--       OR EXISTS (
--         SELECT 1 FROM public.homework_batches hb
--         WHERE hb.id = homework_items.homework_batch_id
--           AND (public.is_student_self(hb.student_id)
--                OR public.is_parent_of_student(hb.student_id))
--       )
--     );
-- ============================================================
