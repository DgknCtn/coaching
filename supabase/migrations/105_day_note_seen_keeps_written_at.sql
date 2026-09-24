-- ============================================================
-- 105 — "GÖRÜLDÜ" İŞARETİ NOTUN YAZILMA ANINI BOZMASIN (R8 §17A)
--
-- SORUN (yerel doğrulamada görüldü): öğretmen bir gün notunu "Gördüm"
-- diye işaretleyince akıştaki zaman etiketi 11:32'den 13:50'ye kaydı.
--
-- Sebep: 101'deki `handle_updated_at` trigger'ı HER UPDATE'te çalışıyor
-- ve 104'ün `mark_day_note_seen` fonksiyonu da bir UPDATE. Yani
-- öğretmenin OKUMA eylemi, öğrencinin YAZMA anını üzerine yazıyordu.
--
-- NEDEN ÖNEMLİ
-- §17A'daki akış şöyle okunuyor:
--
--   Buse · Salı 20:14
--   "Perşembe sınavım var, bugün ona hazırlanıyorum."
--
-- Buradaki saatin tek işi öğrencinin O CÜMLEYİ NE ZAMAN kurduğunu
-- söylemek; öğretmenin bağlamı ondan çıkıyor ("dün akşam yazmış").
-- Öğretmenin kendi okuma anını göstermek bu bilgiyi yok eder ve
-- sessizce yanlış bilgi verir: not sabah yazılmışken öğleden sonra
-- yazılmış görünür.
--
-- Yan etki daha da kötüydü: panel akışı `updated_at DESC` sıralıyor.
-- Görülen not listenin BAŞINA zıplıyordu — yani "gördüm" demek, o notu
-- öne çıkarıyordu. Okunmuşu yukarı taşıyan bir okunmamışlar listesi.
--
-- ÇÖZÜM: trigger KOŞULLU hale geliyor. `updated_at` yalnız notun METNİ
-- değiştiğinde ilerler. Öğrencinin notunu düzenlemesi yine zamanı
-- tazeler (doğru davranış: o gerçekten yeni bir cümle); öğretmenin
-- okuması tazelemez.
--
-- NEDEN AYRI BİR `written_at` SÜTUNU DEĞİL
-- İkinci bir zaman sütunu, "hangisi doğru" sorusunu ve her okuma
-- yerinde onu seçmeyi zorunlu kılardı. Sorun sütunun eksikliği değil,
-- trigger'ın fazla geniş olmasıydı; dar olan yeri daraltmak doğru.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_day_notes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_day_notes
  FOR EACH ROW
  WHEN (OLD.note_text IS DISTINCT FROM NEW.note_text)
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS handle_updated_at ON public.student_day_notes;
--   CREATE TRIGGER handle_updated_at
--     BEFORE UPDATE ON public.student_day_notes
--     FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
-- ============================================================
