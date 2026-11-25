# WhatsApp katmanı — değerlendirme (25.11.2026)

Kaynak: *İz Calendar Entegrasyonu · WhatsApp Ayrı Katman* (23.11.2026), §4.
Karar: bu sürümde WhatsApp **otomatik gönderimi kurulmadı**. Calendar çekirdeği
WhatsApp olmadan eksiksiz çalışır; WhatsApp yalnız hatırlatma ve yoklama
kanalı olarak sonradan eklenebilir.

## 1. Bugün çalışan ara çözüm (sıfır maliyet)

| Yer | Ne yapar |
|---|---|
| Ders & Görüşmeler → haftalık satır menüsü | Planlanan ders için "Hatırlatma metnini kopyala" / "WhatsApp'ta aç" |
| Öğrenci → Ödev Planı → Plan penceresi | "Ödev yoklaması" metni: kopyala / WhatsApp'ta aç |

- Metinler `lib/share-text.ts` içinde saf fonksiyonlar: `buildLessonReminder`,
  `buildHomeworkCheckIn`, `whatsappShareUrl`.
- "WhatsApp'ta aç" `https://wa.me/?text=…` açar; kişiyi öğretmen seçer. İz
  numara saklamaz, mesaj göndermez, yanıt okumaz. Yanıt WhatsApp'ta kalır.
- Calendar'dan gelen derste Meet bağlantısı metne eklenir.

## 2. Otomatik gönderim için önkoşullar (Meta WhatsApp Cloud API)

1. **Meta Business hesabı ve işletme doğrulaması** (vergi levhası / ticari
   unvan belgeleri). Doğrulanmamış hesapta günlük gönderim sınırı düşüktür.
2. **Ayrı bir telefon numarası.** WhatsApp Business uygulamasında ya da kişisel
   WhatsApp'ta kullanılan numara aynı anda Cloud API'ye bağlanamaz (geçiş
   mümkün ama o numaradaki uygulama kullanımı biter).
3. **Şablon mesajlar.** 24 saatlik müşteri penceresi dışında yalnız Meta'nın
   onayladığı şablonlar gönderilebilir. Gereken iki şablon (kategori: *utility*):
   - `ders_hatirlatma`: `{{1}}` ad, `{{2}}` gün/saat; isteğe bağlı URL düğmesi (Meet).
   - `odev_yoklama`: `{{1}}` ad.
   Onay genelde kısa sürer ama reddedilebilir; metin pazarlama dili içermemeli.
4. **İletişim izni (opt-in).** Öğrenciden/veliden WhatsApp ile mesaj alma onayı
   alınmalı ve kaydı tutulmalı. 18 yaş altı öğrencide veli onayı esas alınmalı.
5. **Webhook.** Teslim / okundu / hata durumları ve gelen yanıtlar için
   herkese açık, imza doğrulamalı bir uç (`/api/whatsapp/webhook`).
6. **Erişim anahtarı.** Kalıcı "System User" anahtarı; Calendar anahtarı gibi
   sunucuda şifreli saklanır.

## 3. İz'de gereken veri modeli (taslak, kodlanmadı)

- `messaging_consents`: `student_id`, `recipient` (öğrenci/veli), `phone_e164`,
  `granted_at`, `granted_by`, `revoked_at`, `source`. Mevcut `students.phone`
  doğrulanmamış serbest metin; gönderimde kullanılmadan önce E.164'e
  normalize edilip onayla eşleşmeli. Veli onay altyapısı (144) yeniden
  kullanılabilir, ama WhatsApp onayı ayrı bir kapsam olarak kaydedilmeli.
- `message_log`: `session_id` / `plan_id`, şablon adı, `wa_message_id`, durum
  (`queued/sent/delivered/read/failed`), hata kodu. `email_log` (131) deseniyle
  aynı: tekrarsızlık anahtarı ve 180 gün saklama.
- Gönderim tetikleyicisi: Vercel Hobby'de yalnız günde bir zamanlanmış iş
  olduğu için "dersten 2 saat önce" hatırlatması **Pro plan** (ya da dış
  zamanlayıcı) gerektirir. Hobby'de en fazla "sabah 06:00'da bugünün dersleri"
  gönderilebilir.

## 4. Efor, maliyet, risk

| Kalem | Tahmin |
|---|---|
| Geliştirme (onay kaydı, şablon gönderimi, webhook, log, ekranlar) | 4–6 iş günü |
| Meta tarafı kurulum ve doğrulama | Meta'ya bağlı; birkaç gün – birkaç hafta |
| Aylık maliyet | Meta konuşma/mesaj başına ücretlendirir; *utility* şablon fiyatı ülkeye göre değişir. **Güncel tutar Meta'nın resmî fiyat sayfasından (developers.facebook.com → WhatsApp → Pricing) kurulum anında doğrulanmalı**; bu belgede tahmini rakam verilmedi. Ek olarak Vercel Pro (dakikalık zamanlama gerekiyorsa). |
| Bakım riski | Şablon reddi/değişikliği, numara kalite puanı düşüşü (çok engellenirse gönderim sınırlanır), Meta API sürüm geçişleri, onay kayıtlarının KVKK yükümlülüğü. |

## 5. Önerilen pilot (Calendar'ı değiştirmeden)

1. Ara çözümü 2–3 hafta kullanın: hangi metin gerçekten gönderiliyor, öğrenci
   yanıt veriyor mu?
2. Değer görülürse 2–3 öğrenci (velisinden yazılı onay alınmış) ile Cloud API
   test numarasında yalnız `ders_hatirlatma` şablonu.
3. Ölçüt: kaçırılan ders sayısı ve öğretmenin elle mesaj yazma süresi. Fayda
   yoksa kurulum genişletilmez; çekirdek akış zaten WhatsApp'sız tamamdır.

## 6. Bu sürümde yok

Otomatik gönderim, yanıtların İz'e aktarılması, numara doğrulama, toplu mesaj.
