# İZ PRD (26-27 Eylül 2026) — uygulama durumu

Dal: `faz-1-dogruluk` (master'a birleştirilmedi). Son güncelleme: 27 Eylül 2026.

| Kalem | Durum | Not |
|---|---|---|
| B01 | Yapıldı | Veli, öğretmen paneli, Haftam, ödev oluşturma, rapor: sorgu hatası boş veri gibi okunmuyor (`lib/data-result.ts`) |
| B02 | Yapıldı | Panel tablosunda durumun gerekçesi (`computeStudentStatus.signals`) |
| B03 | Yapıldı | Panelde "Dikkat İsteyenler" şeridi; ana tablo sırası ve eşikler değişmedi |
| B04 | Yapıldı | Sözlüğe `delivered` (Teslim Edilen) eklendi; "Tamamlanan" = öğretmen onayı |
| B05 | Yapıldı | Taslak kayıt durumu, sıralı kayıt, okuma hatasında üzerine yazmama |
| B06 | Yapıldı | Ayrı bağlanmama nedenleri; yeniden yayınlamadan bağlamayı tekrar dene |
| B07 | Yapıldı | Haftam'da "Bugüne git" ve "Planlanmamışlar" |
| B08 | Yapıldı | Veli özeti yalnız veri geldiyse olumlu |
| B09 | Kısmen | Panel tablosu; diğer 27 `hideBelow` sütunu 375 px'te tek tek doğrulanmadı |
| B10 | Kısmen | Form hataları `aria-describedby` ile bağlı; klavye/ekran okuyucu elle test edilmedi |
| B11 | Yapıldı | Genel ilerleme ve ödev oranı paydasını yazıyor |
| B12 | Yapıldı | Panel araması ve filtresi `?ara=` / `?durum=` |
| B13 | Kısmen | Panel view'ı 112/113 ile hızlandı (taban p50 2.372 → 395 ms); 40 eşzamanlı (normal) yeniden koşulmadı |
| B14 | Yapıldı | MatMüh metinleri, "Kapat", footer bağlantıları; telefon yer tutucusu karar gereği duruyor |
| B15 | Büyük ölçüde | Yedek, alarm sahipliği, yük testi koşumcusu, SEC-01/02/04 — bu klasördeki belgeler |
| B16, B18 | Onay bekliyor | PRD "ayrıca onaylanacak genişleme" |
| B17 | Beklemede | Açık sorulara bağlı (hedef segment, 10 saniye testi için koç grubu) |

## Açık işler

- Yük testi `normal` kademesi düzeltme sonrası yeniden koşulmalı.
- Canlıdaki `academic_notes` içinde `LOAD-01 prob notu%` kayıtları silinmeli.
- 29 Eylül: PERF-02 fark ölçümü ve kalan 66 FK adayı.
