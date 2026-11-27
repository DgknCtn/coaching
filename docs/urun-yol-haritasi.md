# İZ ürün yol haritası (28.11.2026)

Kaynak: *İZ – Feature Showcase & Product Expansion PRD* (§10, §19). Bu belge
PRD'deki genişleme önerilerini **bugünkü kodla** eşleştirir: neyin zaten var
olduğunu, neyin kısmen var olduğunu ve neyin sıfırdan yapılacağını gösterir.

> **Kural (PRD Risk 2):** Buradaki maddelerin hiçbiri, `lib/features/catalog.ts`
> içinde `status: 'available'` yapılmadan `/ozellikler` ya da anasayfada
> görünmez. Bir özellik bittiğinde durumu güncellenir ve tanıtım sayfası
> kendiliğinden güncellenir.

## Durum özeti

| PRD | Özellik | Öncelik | Bugün | Mevcut temel |
|---|---|---|---|---|
| 10.4 | Planı kopyala | P1 | **Var** (Faz 2a) | Ödev Ver → "Önceki plandan kopyala" (`lib/plan-copy.ts`) |
| 10.2 | Öğrenci notları ve etiketler | P1 | **Var** (Faz 2b) | Etiketler (159), liste süzgeci, notlarda arama |
| 10.1 | Aktivite zaman tüneli | P1 | **Var** (Faz 2c) | Öğrenci → Diğer → Zaman Tüneli (`lib/activity-timeline.ts`) |
| 10.3 | Ödev şablonları | P1 | **Var** (Faz 2d) | Ödev şablonları (160), Ödev Ver'de uygula/kaydet |
| 10.5 | Akıllı öğrenci durumu | P1 | **Var** | `lib/student-status.ts` — kurala dayalı, gerekçeli (Yolunda / Takip Et / Geride / Müdahale) |
| 10.6 | Haftalık yük görselleştirme | P2 | **Kısmen** | Haftalık Akış tempo şeridi, öğrencinin gün dağıtımı (Haftam) |
| 10.7 | Hedef takibi | P2 | **Kısmen** | Kitap hedefleri ve ara hedefler (`student_book_targets`) |
| 10.8 | İlerleme içgörüleri | P2 | **Kısmen** | Rapor sayfası (`students/[id]/report`) ve AI özet |
| 10.9 | Görüşme özeti | P2 | **Kısmen** | Ders notu, plan geçmişi, `interventions`, check-in'ler |
| 10.10 | Veli haftalık özeti | P2 | **Kısmen** | Veli paneli; hazır WhatsApp metinleri |
| 10.11 | Deneme sınavı takibi | P2 | **Yok** | — |
| 10.12 | Konu bazlı eksik takibi | P3 | **Yok** | Müfredat/konu yapısı (`curriculum`) temel olabilir |
| 10.13 | Öğrenci portfolyosu | P3 | **Kısmen** | Rapor sayfası, kitap geçmişi |
| 10.14 | Grup yönetimi | P3 | **Kısmen** | Grup dersleri (`student_groups`, `group_sessions`) |
| 10.15 | AI çalışma planı asistanı | P3 | **Yok** | Rapor AI özeti altyapısı |
| — | Ekip / çok öğretmen | — | **Yok** | PRD Persona 3 "ASSUMED"; tanıtılmaz |

## P1 — tamamlandı (28.11.2026)

Aşağıdaki tasarımların dördü de uygulandı; katalogda `available`.
Not: kitap şablonu bilinçli olarak YOK — şablon yalnız görevleri tutar,
kitap çalışması her hafta haritadan seçilir (ya da "Planı kopyala" ile
devamı getirilir).

### 2a · Planı kopyala (PRD 10.4)
- **Fayda:** Tekrarlayan haftalık işi azaltır.
- **Tasarım:** Önceki Ödev Planı'nda "Kopyala" seçeneği.
  - Akademik görevler taslak olarak gelir.
  - Kitap kalemlerinden **yalnız yapılmamış** olanlar sepete alınır.
  - Biten iş kopyalanmaz.
  - Yayın yine öğretmenin onayıyla olur.
- **Veri:** Mevcut tablolar; migration beklenmiyor.
- **Risk:** Aynı sayfanın iki kez ödevlenmesi. Bunu `create_homework_batch`'in mevcut reddi engeller.

### 2b · Öğrenci notları ve etiketler (PRD 10.2)
- **Fayda:** Öğrencinin bağlamı ("tekrar ihtiyacı", "sınav yaklaşıyor") kaybolmaz.
- **Tasarım:**
  - Etiketler çalışma alanına özel ve düzenlenebilir.
  - Öğrenci listesinde etikete göre süzme.
  - Notlarda arama.
  - Notlar öğretmene özel; veli ve öğrenci görmez.
- **Veri:** Yeni `student_tags` ve `student_tag_links` tabloları; RLS ile yalnız öğretmen.
- **Dikkat:** Hassas bilgi uyarısı. Etiket bir tanı gibi görünmemeli (PRD 10.5 notu).

### 2c · Aktivite zaman tüneli (PRD 10.1)
- **Fayda:** Tek ekranda öğrencinin geçmişi.
- **Tasarım:**
  - Öğrenci profilinde sekme.
  - Süzgeçler: akademik / ders / görüşme / ödeme / not.
  - Yalnız var olan kayıtlardan; türetilmiş yorum yok.
- **Veri:** Mevcut tablolardan tek okuma RPC'si (UNION, sayfalı). Yeni tablo yok.

### 2d · Ödev şablonları (PRD 10.3)
- **Fayda:** "TYT haftalık rutin" gibi kalıplar her öğrenciye yeniden yazılmaz.
- **Tasarım:**
  - Öğretmen şablon kaydeder.
  - Öğrenciye uygular; taslak görevler oluşur ve öğrencinin takvimine uyarlanır.
  - Yayın öğretmenin onayıyla olur.
- **Veri:** Yeni `homework_templates` tablosu (öğretmene özel, kalemler).

## P2/P3 — değerlendirme notları
- **Deneme sınavı ve konu eksikleri** (10.11–10.12): Yeni veri modeli gerekiyor (sınav, ders, doğru/yanlış/boş, konu kırılımı). Konu eşlemesi için müfredat yapısı kullanılabilir. Efor: orta-yüksek.
- **AI çalışma planı** (10.15): Yalnız taslak üretir; öğretmen onaylamadan hiçbir şey yayımlanmaz (PRD şartı). Mevcut rapor AI özetinin gizlilik ve onam deseni izlenir.
- **Grup yönetimi** (10.14): Grup dersleri zaten var. Grup ödevi ve ortak plan, lisans modeli (öğrenci sayısı) ile birlikte ayrıca değerlendirilmeli (PRD notu).
- **İçgörüler** (10.8): Yalnız takip edilen veriden üretilir; akademik başarı uydurulmaz.

## Bir özellik bittiğinde (yayın kontrol listesi)
1. `lib/features/catalog.ts`'te durumu `available` yap. Faydasını ve maddelerini bugünkü davranışa göre yaz.
2. Ekranı varsa `components/marketing/mock/*`'e ekle, `MockKey`'e bağla.
3. Gerekirse SSS'ye soru ekle (`featuresOnly`).
4. `tests/features-showcase.test.ts` geçmeli.
