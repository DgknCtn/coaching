# İZ — Canlıya Alma Planı ve Durum (Ücretsiz Pilot)

Son güncelleme: 11 Ekim 2026 · Canlı adres: https://www.matematiginmuhendisi.com

İşaretler: ✅ tamam · ⏳ bekliyor · ⚠️ açık sorun · 🧑 kullanıcı · 🤖 kod

## Kararlar (11 Ekim 2026)
- **Hedef:** ücretsiz pilot. 3-5 koç, ödeme yok, 2-4 hafta. Ücretli açılış ayrı bir kapı (Faz 7).
- **Alan adı:** `matematiginmuhendisi.com`. Kök adres `www`'ye yönleniyor.
- **Kapsam:** web + PWA. Native mobil uygulama yok.
- **AI özetleri:** kod hazır ama **KAPALI**. Ücretli olduğu için kullanıcı istemedi; anahtar eklenmedikçe hiçbir maliyet yok.
- **Deneme süresi** 3 gün kalıyor. Pilot koçların alanı yönetim panelinden süresiz açılacak.
- **Giriş:** tek ekran (`/login`). Google kaldırıldı. Öğrenci ve veli, öğretmenin verdiği kullanıcı adı + PIN ile giriyor.

## ⚠️ Şu anki açık sorun
- **Vercel yeniden yayını hata veriyor** (commit `2976031`).
  - Gelen log kesik; hatanın satırı görülmedi.
  - En olası sebep: `NEXT_PUBLIC_APP_URL` değeri geçerli bir adres değil. Doğru değer `https://www.matematiginmuhendisi.com`: başta `https://`, sonda `/` yok, boşluk yok.
- **Etkisi:** canlı sürüm hâlâ eski adresi kullanıyor.
  - Canonical ve sitemap `coaching-tan-three.vercel.app` gösteriyor.
  - "Şifremi unuttum" bağlantısı yanlış adrese gidebilir.
- **Sonra:** yayın düzelince canonical ve sitemap'in yeni adrese geçtiği kontrol edilecek. Şifre sıfırlama e-postası ve ilk PIN verme kullanıcı tarafından denenecek.

## Faz 0 — Hesaplar ve kararlar
- ⏳🧑 Pilot koç listesi (3-5 koç) ve başarı ölçütü.
- ⏳🧑 Pilot süresi ve pilot sonrası teklif.
- ✅ İletişim e-postası `info@matematiginmuhendisi.com`, Instagram `matematigin.muhendisi`. WhatsApp numarası verilmedi; footer'da gizli.
- ⏳🧑 Supabase, Vercel, GitHub ve alan adı firmasında 2FA; GitHub deposunun private olması.

## Faz 1 — Altyapı
- ✅ Alan adı Vercel'e bağlandı.
- ⚠️🧑 Vercel ortam değişkenleri:
  - `NEXT_PUBLIC_APP_URL` düzeltilip yeniden yayınlanmalı (yukarıdaki sorun).
  - `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` silinmeli.
  - `SMTP_*` ve `EMAIL_FROM` tanımlı olmalı.
- ✅🧑 Supabase Auth (kullanıcı yaptı):
  - Site URL ve Redirect URL'ler ayarlandı.
  - Google kapatıldı.
  - "Confirm email" **KAPALI** kalmalı; açılırsa PIN verme kırılır.
  - Kayıt açık, şifre en az 6 karakter (uygulamayla aynı).
- ✅🧑 Özel SMTP ayarlandı (kullanıcı beyanı). ⏳ Gerçek e-postayla denenmedi.
- ✅ Öğrenci giriş alanının MX kaydı: PIN girişleri çalışıyor.
- İzleme:
  - ✅🤖 Web Analytics kodu eklendi; adreslerdeki kimlikler maskeli. ⏳🧑 Vercel panelinde açılması gerekiyor.
  - ⏳🧑 UptimeRobot: `/api/health` ve `/login`.
  - ⏳🧑 Sentry: DSN verilirse 🤖 bağlanır.
- ⏳🤝 Geri yükleme tatbikatı pilottan **önce** yapılacak; ücretsiz ikinci bir Supabase projesi gerekiyor.

## Faz 2 — Ürün ve UX
- ✅ Yer tutucular temizlendi (`lib/brand.ts`). Telefon ve WhatsApp, değer gelene kadar gizli.
- Rol yürüyüşleri:
  - ✅ Otomatik 375 px yürüyüşü (`e2e/mobil-yuruyus.spec.ts`): 20 sayfada taşma yok, WCAG ihlali yok.
  - ⏳ Dolu veriyle (kitap ve ödevi olan öğrenci) elle yürüyüş yapılmadı.
- ✅ PWA: manifest, ikonlar ve "ana ekrana ekle" ipucu. Service worker bilinçli olarak yok; bayat veri gösterilmesin diye.
- ✅ Kurulum listesine "Öğrenciye ve veliye giriş verin" adımı eklendi.
- ⏳🧑 Pilot koçların alanı yönetim panelinden süresiz açılacak.
- ⏳🤖 Koç panelinde "pilot geri bildirimi" kategorisi.

## Faz 3 — Güvenlik ve KVKK
- ✅ Güvenlik gözden geçirmesi yapıldı. Bir açık kapatıldı (`2976031`): başka bir alanda üyeliği olan hesap PIN'e çevrilemiyor.
- ✅ Next 15.5.27 güvenlik yaması. Kalan postcss açığı Next 16 büyük sürüm geçişini bekliyor; yalnız derleme anında etkili.
- ✅ Veli onayı teyidi (migration 144): ilk giriş bilgisi verilmeden önce koç işaretliyor.
- ⏳🧑 Gizlilik metni: veri sorumlusu, saklama süresi, analitik.
- ⏳🧑 Pilot katılım metni.
- ⏳🧑 VERBİS yükümlülüğünün netleştirilmesi.

## Faz 4 — Test ve kabul
- ✅ Test kiracıları: testler yalnız adı "Test" ile başlayan öğrenciyi hedefliyor.
  - B: "Test 1". B kullanıcının **GERÇEK** alanı (Matematigin Muhendisi); diğer öğrencilere dokunulmaz.
  - A: "Test A" ve "Test Veli".
  - A'nın deneme süresi **10 Kasım 2026**'da bitiyor. Biterse yönetim panelinden "denemeyi uzat" (işlem başına en fazla 30 gün) ya da ücretsiz lisans tanımlanmalı.
- ✅ Playwright:
  - `e2e/giris-akisi.spec.ts`: koç girişi → PIN ver → öğrenci girişi → "PIN'imi unuttum" → yeni PIN.
  - `e2e/mobil-yuruyus.spec.ts`: 375 px rol yürüyüşü.
  - Not: arka arkaya koşulursa giriş hız sınırına takılır (15 dakikada 10 deneme).
- ✅ Tam test paketi yeşil: 97 dosya, 2372 test.
- ⏳🤝 Kapasite ölçümü ikinci Supabase projesinde yapılacak. Canlıya yük testi koşulmaz.
- ⏳ Kabul kapısı: CI yeşil + geri yükleme tatbikatı + izleme alarmı test edildi.

## Faz 5 — Pilot
- ✅ Pilot metrikleri (migration 145): Yönetim → Kullanım → "Pilot — koç başına".
- ⏳🤝 Koç başına kurulum seansı, haftalık görüşme, pilot sonu kararı.

## Faz 6 — AI özetleri
- ✅🤖 Kod hazır (migration 146, İlerleme Raporu sayfasında). **Kapalı.**
  - Açmak için iki ortam değişkeni birlikte gerekir: `AI_GATEWAY_API_KEY` + `AI_SUMMARIES_ENABLED=1`.
  - Kullanıcı istemedikçe açılmayacak.

## Faz 7 — Ücretli açılış (pilot sonrası)
Bu maddeler şimdi yapılmayacak, yalnız listelendi:
- iyzico canlı anahtarları.
- Mesafeli satış, ön bilgilendirme ve iade metinlerinin şirket bilgileriyle tamamlanması.
- ETBİS kaydı, e-arşiv fatura, avukat incelemesi.
- Vercel Pro, Resend'e geçiş.
- Supabase Pro kararı; panel RPC.

## Landing
- ✅ İkna eden sürüm canlıda (`68322d8`): yeni hero, telefon önizlemesi, kurucu hikâyesi, güncel SSS.
- ⏳🧑 Gerçek kullanıcı sözleri. `lib/testimonials.ts` dosyasına yalnız izinli sözler girer.

## Canlıya uygulanan migration'lar (bu çalışma)
143 PIN talepleri · 144 veli onayı · 145 pilot metrikleri · 146 AI kotası — hepsi ✅.
