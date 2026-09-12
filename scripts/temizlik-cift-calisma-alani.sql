-- ============================================================
-- ÇİFT BİREYSEL ÇALIŞMA ALANI TEMİZLİĞİ — ELLE, ADIM ADIM
--
-- 096'daki tekillik indeksi şu hatayla durduğunda kullanılır:
--   could not create unique index "uq_workspaces_one_individual_per_owner"
--   DETAIL: Key (owner_profile_id)=(...) is duplicated.
--
-- ÖN KOŞUL — 095 UYGULANMIŞ OLMALI.
--
-- Silinen alan profilin varsayılanıysa `default_workspace_id` NULL'a
-- düşer (ON DELETE SET NULL). Kullanıcı sonra `/`'a girdiğinde geç
-- kurulum dalı çalışır ve 095 UYGULANMAMIŞSA ÜÇÜNCÜ bir alan açar.
-- 095 ile aynı dal var olan alanı bulup varsayılanı onarır. Yine de
-- 3. adım varsayılanı silmeden ÖNCE elle taşır: NULL penceresi hiç
-- açılmasın.
--
-- GERİ DÖNÜŞÜ YOKTUR. `workspaces`'a bağlı tüm tablolar ON DELETE
-- CASCADE: öğrenci, kitap, ödev, seans, ödeme, denetim kaydı — hepsi
-- alanla birlikte gider. Bu yüzden 2. adımda VERİSİ OLAN bir alan
-- silinmez; öyle bir durumda taşıma gerekir, bu dosya onu kapsamaz.
--
-- Adımları TEK TEK çalıştırın, her birinin çıktısını okuyun.
-- ============================================================


-- ---------- 1. ADIM: çakışan profili ve alanları gör ----------
--
-- Hata mesajındaki owner_profile_id'yi buraya yazın.

SELECT
  p.email,
  w.id            AS workspace_id,
  w.name,
  w.created_at,
  (p.default_workspace_id = w.id) AS varsayilan,
  (SELECT count(*) FROM public.students          s WHERE s.workspace_id = w.id) AS ogrenci,
  (SELECT count(*) FROM public.books             b WHERE b.workspace_id = w.id) AS kitap,
  (SELECT count(*) FROM public.academic_terms    t WHERE t.workspace_id = w.id) AS donem,
  (SELECT count(*) FROM public.homework_batches h WHERE h.workspace_id = w.id) AS odev_partisi,
  (SELECT count(*) FROM public.workspace_members m WHERE m.workspace_id = w.id) AS uyelik
FROM public.workspaces w
JOIN public.profiles p ON p.id = w.owner_profile_id
WHERE w.owner_profile_id = '5f0cb9f2-89cb-4eb6-9a3e-18fcf7a252d6'
  AND w.type = 'individual'
  AND COALESCE(w.is_library, FALSE) = FALSE
ORDER BY w.created_at;

-- KARAR:
--   * ogrenci/kitap/donem/odev sütunlarının HEPSİ 0 olan alan silinebilir.
--   * İkisinde de veri varsa DURUN. Silmek veri kaybıdır; taşıma gerekir.
--   * uyelik sütunu 2 olur (owner + teacher) — bu normaldir, veri sayılmaz.
--
-- Aşağıdaki iki id'yi bu çıktıya göre doldurun:
--   KALACAK  = kullandığınız, verisi olan alan
--   SILINECEK = boş olan alan


-- ---------- 2. ADIM: silinecek alanın gerçekten boş olduğunu doğrula ----------
--
-- 1. adımın çıktısına güvenmek yerine tek satırda tekrar sorulur: bu
-- sorgu 0 döndürmezse SİLMEYİN.

SELECT
    (SELECT count(*) FROM public.students             WHERE workspace_id = '<SILINECEK>')
  + (SELECT count(*) FROM public.books                WHERE workspace_id = '<SILINECEK>')
  + (SELECT count(*) FROM public.academic_terms       WHERE workspace_id = '<SILINECEK>')
  + (SELECT count(*) FROM public.homework_batches WHERE workspace_id = '<SILINECEK>')
  AS toplam_veri;


-- ---------- 3. ADIM: varsayılanı KALACAK alana taşı ----------
--
-- Silmeden önce yapılır: aksi hâlde NULL penceresi açılır ve kullanıcı o
-- arada giriş yaparsa geç kurulum dalına düşer.

UPDATE public.profiles
SET default_workspace_id = '<KALACAK>'
WHERE id = '5f0cb9f2-89cb-4eb6-9a3e-18fcf7a252d6';


-- ---------- 4. ADIM: sil ----------
--
-- Üyelikler, dönemler ve geri kalan her şey CASCADE ile gider; ayrıca
-- workspace_members silmeye gerek yok.
--
-- `type` ve `is_library` koşulları kasıtlı: yanlış bir id yazılırsa
-- kütüphane alanını ya da bir kurumu silme ihtimalini kapatır.

DELETE FROM public.workspaces
WHERE id = '<SILINECEK>'
  AND owner_profile_id = '5f0cb9f2-89cb-4eb6-9a3e-18fcf7a252d6'
  AND type = 'individual'
  AND COALESCE(is_library, FALSE) = FALSE;

-- Beklenen çıktı: DELETE 1. "DELETE 0" ise koşullardan biri tutmadı —
-- id'yi ve owner_profile_id'yi kontrol edin, silmeyi zorlamayın.


-- ---------- 5. ADIM: başka çakışma kalmadığını doğrula ----------
--
-- Bu sorgu 0 satır dönene kadar 096 çalıştırılmaz. Aynı kusur başka
-- hesaplarda da olabilir; hata mesajı size yalnız İLK çakışmayı söyler.

SELECT owner_profile_id, count(*) AS alan_sayisi, array_agg(name) AS adlar
FROM public.workspaces
WHERE type = 'individual' AND COALESCE(is_library, FALSE) = FALSE
GROUP BY owner_profile_id
HAVING count(*) > 1;


-- ---------- 6. ADIM: 096'yı çalıştır ----------
--
-- 5. adım boş döndüyse indeks artık oluşur ve yarış kalıcı olarak kapanır.
--
-- SON: kullanıcının tarayıcısındaki `active_workspace` çerezi silinen
-- alanı gösteriyorsa bir şey yapmanız gerekmez — resolveActiveWorkspace
-- doğrulanamayan tercihi yok sayıp varsayılana düşer ve sunucu
-- günlüğüne "[workspace] çerezdeki aktif alan tercihi doğrulanamadı"
-- satırını yazar.
