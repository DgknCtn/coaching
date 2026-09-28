# İZ PRD (26-27 Eylül 2026) — uygulama durumu

Dal: `master` (Faz 1-5 ve yönetim paneli birleştirildi, canlıda). Son güncelleme: 28 Eylül 2026.

## Backlog

| Kalem | Durum | Not |
|---|---|---|
| B01 | Yapıldı | Veli, öğretmen paneli, Haftam, ödev oluşturma, rapor: sorgu hatası boş veri gibi okunmuyor (`lib/data-result.ts`) |
| B02 | Yapıldı | Panel tablosunda durumun gerekçesi (`computeStudentStatus.signals`) |
| B03 | Geri alındı | "Dikkat İsteyenler" şeridi 27 Eylül'de kullanıcı kararıyla kaldırıldı; tablodaki gerekçe (B02) ve filtre (B12) duruyor |
| B04 | Yapıldı | Sözlüğe `delivered` (Teslim Edilen) eklendi; "Tamamlanan" = öğretmen onayı |
| B05 | Yapıldı | Taslak kayıt durumu, sıralı kayıt, okuma hatasında üzerine yazmama |
| B06 | Yapıldı | Ayrı bağlanmama nedenleri; yeniden yayınlamadan bağlamayı tekrar dene |
| B07 | Yapıldı | Haftam'da "Bugüne git" ve "Planlanmamışlar" |
| B08 | Yapıldı | Veli özeti yalnız veri geldiyse olumlu |
| B09 | Kısmen | Panel tablosu; diğer 27 `hideBelow` sütunu 375 px'te tek tek doğrulanmadı |
| B10 | Kısmen | Form hataları `aria-describedby` ile bağlı; klavye/ekran okuyucu elle test edilmedi |
| B11 | Yapıldı | Genel ilerleme ve ödev oranı paydasını yazıyor |
| B12 | Yapıldı | Panel araması ve filtresi `?ara=` / `?durum=` |
| B13 | Büyük ölçüde | Sorgu maliyeti çözüldü; kapasite ölçülemedi — ayrıntı aşağıda |
| B14 | Yapıldı | MatMüh metinleri, "Kapat", footer bağlantıları; landing/demo ürün sözlüğüne bağlandı (`tests/marketing-parity.test.ts`). Telefon yer tutucusu karar gereği duruyor |
| B15 | Büyük ölçüde | Yedek, alarm sahipliği, yük testi koşumcusu, SEC-01/02/04 — bu klasördeki belgeler |
| B16 | Yapıldı | Müdahale kaydı: risk → yapılan → sonuç (118); öğrenci detayında Müdahale bölümü |
| B17 | Yapıldı | Aktivasyon hunisi (120); yönetimde Kullanım sekmesinde |
| B18 | Yapıldı | Panel seçici: öğretmen, öğrenci ve veli birden fazla kurumda (`lib/panels.ts`) |

Faz 5'te ayrıca: davet merkezli giriş (116); e-postasız öğrenci girişi — kullanıcı adı + PIN (119, 10a). 10a **kapalı**: alan adı yok, `STUDENT_LOGIN_EMAIL_DOMAIN` tanımlanınca arayüzde görünür. 10b (otomatik davet gönderimi) kullanıcı kararıyla yapılmadı; WhatsApp akışı kalıyor. 117 (panel RPC) ölçülebilir kazanç getirmedi, geri alındı (121).

## B13 — panel ve öğrenci detayı performansı

| Adım | Sonuç |
|---|---|
| 112 + 113 | `student_book_progress_view` fan-out'u kaldırıldı; taban kademede panel p50 2.372 → 395 ms |
| 114 + 115 | Ödev kalemine kurum filtresi, `my_workspace_ids` plpgsql; panel planı 117 → 52 ms |
| LOAD-01 sayfa senaryosu (`fd7660e`) | Yük testi artık uygulamanın gerçek sayfa sorgularını 5-20 sn düşünme süresiyle gönderiyor (`scripts/load/sayfalar.mjs`). Eski senaryo `LOAD_SENARYO=eski` ile — aşırı yük ölçüsü |
| 130 | `student_topic_contact_view`: materyalize CTE ve bağıntılı alt sorgu kaldırıldı; tek başına 1.017 → 72 ms (dogu), 131 → 89 ms (burak). Eski tanımla tüm veride eşitlik migration içinde doğrulandı |
| Sekmeye göre veri (`2fbd8c1`) | Öğrenci detayı yalnız açık sekmenin verisini çekiyor (`lib/student-detail-needs.ts`): Genel Bakış ~34 → ~26 sorgu, diğer sekmeler 9-17 |
| Aşama 0 (`4619232`) | Operasyon satırı bir kez okunup Müdahale bölümüne hatasıyla veriliyor |

**Bugünkü tablo.** Uygulamanın tek tek sorguları veritabanında 0-60 ms (ağ ~70 ms hariç); Genel Bakış'ın sorgu toplamı ~130-260 ms. Belirgin bir yavaş sorgu kalmadı.

**Bilinmeyen: kapasite.** 28 Eylül'de eski senaryoyla (saniyede ~94 istek) koşum %67 5xx verdi ve test bittikten sonra birkaç dakika canlı API'de `25P02` hataları sürdü; kendiliğinden toparlandı, RLS kabul kapısı 113/113. Kırılma noktası saniyede 29 ile 94 istek arasında; kesin değer **canlıda ölçülmeyecek** — ücretsiz ikinci bir Supabase projesi gerekiyor. `25P02`'nin yük kalktıktan sonra sürmesi PostgREST/havuz davranışı; nedeni buradan görünmüyor.

**Ölçüm yöntemi uyarısı.** 1 dakikalık duman testi hataları yakalar ama birkaç yüz ms'lik farkı ölçemez: aynı kodla iki koşu p95 485 / 196 ms verdi. Kesin sonuçlar sıralı tek tek ölçümlerden ve sorgu sayılarından.

**Ertelendi.** Genel Bakış'ı tek bir `SECURITY INVOKER` fonksiyonda toplamak (sayfa başına ~19 → ~7 istek). Tek kullanıcıda kazanç yok, yalnız yük altında havuzu rahatlatır; karar kapasite ölçümünden sonra.

## Yönetim paneli (28 Eylül 2026)

Sekmeler: Genel Bakış, Müşteriler, Kullanıcılar, Kullanım, Gelir, Destek, Kütüphane, Partnerler, Güvenlik, Sistem, Uyum, Yönetim Kaydı. Migration'lar 122-129.

- Öğretmen adıyla, öğrenci ve veli yalnız sayı olarak görünür; kısıt fonksiyonlarda (`tests/admin-privacy.test.ts`).
- Panelden yapılan işlemler gerekçe ister ve değiştirilemez yönetim kaydına yazılır (128, 129).
- **Güvenlik açığı kapatıldı (125):** oturum açmış her kullanıcı kendi profilinde `is_platform_admin` alanını değiştirebiliyordu; artık yalnız SQL Editor / service_role.
- Silme talebi yürütme panelde **yok** (kullanıcı kararı): kapsam — fatura saklama, hesaplar, yedekler — netleşince eklenecek; o zamana kadar SQL Editor'den.

## Açık işler

- **Kapasite ölçümü:** ücretsiz ikinci Supabase projesi açılınca sayfa senaryosuyla `normal` / `buyume` kademeleri orada.
- **B09 / B10:** 375 px'te sütunların ve klavye / ekran okuyucu erişiminin elle doğrulanması.
- **Bağlam sorguları:** her öğretmen sayfası `getTeacherContext` için 5 sorgu gönderiyor; ayrı bir iş.
- **29 Eylül:** PERF-02 fark ölçümü ve kalan 66 FK adayı.
- LOAD-01 prob notları: 28 Eylül'de iki test hesabında 0 kayıt — kapandı.

## Karar bekleyenler

- Silme yürütmenin kapsamı (gerekirse hukuki görüşle).
- Öğrenci kullanıcı adı + PIN girişi için alan adı.
- Ürün soruları: hedef müşteri segmenti, "haftalık"ın tanımı (takvim haftası mı akış mı), koçun birinci ekran önceliği, öğrencinin varsayılan açılışı, 10 saniye testi için koç grubu.
