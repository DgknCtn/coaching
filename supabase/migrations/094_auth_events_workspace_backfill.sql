-- ============================================================
-- 094 — mevcut giriş kayıtlarına çalışma alanı doldurma
-- ============================================================
--
-- 093 log_auth_event'i düzeltti: yeni kayıtlar artık çalışma alanıyla
-- yazılıyor. Ama ÖNCEDEN yazılmış satırların `workspace_id`si NULL
-- kaldı ve auth_events'in RLS politikası kiracıya göre yalıtılmış —
-- yani o satırlar öğretmenin ekranında HİÇ GÖRÜNMÜYOR.
--
-- Ekranda doğrulandı: /teacher/ayarlar/guvenlik "0 hareket" diyordu,
-- oysa kayıt vardı. Bir düzeltmenin yalnız ileriye dönük çalışması,
-- kullanıcı için "çalışmıyor" demektir.
--
-- 093 İLE AYNI KURAL: önce profilin varsayılan alanı, yoksa ilk aktif
-- üyelik. İkisi ayrışırsa geçmiş ile bugün farklı yerlere düşer.
--
-- YALNIZ NULL OLANLARA DOKUNULUR. Zaten alanı olan bir satırı yeniden
-- hesaplamak, o günkü doğru atfı bugünkü üyelik durumuyla ezmek
-- olurdu — üyelik değişmiş olabilir.
--
-- SATIRLAR SİLİNMEZ, DEĞİŞTİRİLEN TEK ALAN workspace_id. Denetim
-- kaydının değişmezliği (051'in kuralı) burada bilinçli olarak bir kez
-- esnetiliyor: eksik bir alanı doldurmak, kaydı tahrif etmek değil
-- tamamlamaktır ve alternatifi verinin erişilemez kalması.
--
-- Yeniden çalıştırılabilir: ikinci çalıştırmada eşleşen satır kalmaz.
-- ============================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH dolduruldu AS (
    UPDATE public.auth_events e
    SET workspace_id = COALESCE(
      (SELECT pr.default_workspace_id
         FROM public.profiles pr
        WHERE pr.id = e.profile_id),
      (SELECT wm.workspace_id
         FROM public.workspace_members wm
        WHERE wm.profile_id = e.profile_id
          AND wm.status = 'active'
        ORDER BY wm.created_at
        LIMIT 1)
    )
    WHERE e.workspace_id IS NULL
      AND e.profile_id IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM dolduruldu;

  RAISE NOTICE 'auth_events: % satıra çalışma alanı yazıldı', v_count;
END;
$$;
