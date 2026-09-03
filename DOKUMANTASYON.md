# Koçluk Takip Sistemi — Uygulama Dokümantasyonu

> Özel ders öğretmenleri için Excel'in yerini alan, rol tabanlı ve mobil uyumlu bir SaaS web uygulaması. Öğretmen–öğrenci–veli üçgeninde kitap, test ve ödev takibini tek platformda toplar.

---

## 1. Uygulama Ne İşe Yarar?

Bir özel ders öğretmeni tipik olarak 15–20 öğrenciyi ayrı ayrı Excel dosyalarında takip eder: hangi kitabı işliyorlar, hangi testleri çözdüler, bu haftanın ödevi ne, veliye ne bildirilecek. Bu süreç zahmetli ve hataya açıktır.

Bu uygulama o defteri dijitalleştirir:

- **Öğretmen** kitap havuzu oluşturur, öğrenci ekler, kitap atar, ödev verir ve tüm sınıfın ilerlemesini tek ekrandan izler.
- **Öğrenci** kendi paneline girer, verilen ödevleri görür, çözdüğü testleri "tamamladım" olarak işaretler.
- **Veli** salt-okunur bir özet panelden çocuğunun ilerlemesini ve ödev durumunu takip eder.

Herkes davet linkiyle sisteme katılır; kimse birbirinin verisini göremez.

---

## 2. Roller ve Yetkiler

| Rol | Ne Yapar | Erişim |
|-----|----------|--------|
| **Owner / Teacher** | Kitap havuzu, öğrenci, dönem, ödev yönetimi; tüm ilerlemeyi görür | Tam yetki (çalışma alanı sahibi) |
| **Assistant** | (Şema hazır) Öğretmene yardımcı rol | Sınırlı yönetim |
| **Student** | Ödevlerini görür, test tamamlama işaretler / geri alır | Sadece kendi verisi |
| **Parent** | Çocuğunun özetini görür | Salt-okunur |

Roller `workspace_members` tablosunda tutulur. Öğretmen kayıt olduğunda kendisi için iki üyelik satırı oluşur (`owner` + `teacher`).

---

## 3. Temel Kavramlar (Veri Modeli)

Uygulama **çalışma alanı (workspace)** merkezlidir — her öğretmenin izole bir alanı vardır ve tüm veriler `workspace_id` ile ayrılır.

```
Workspace (çalışma alanı)
├── Academic Term (eğitim dönemi: örn. "2025-2026 Güz")
├── Students (öğrenciler)  ──┐
├── Books (kitap havuzu)     │
│   ├── Sections (üniteler)  │
│   └── Tests (testler)      │
├── Student Book Assignments (öğrenciye kitap atama) ◄─┘
├── Homework Batches (ödev paketleri)
│   └── Homework Items (paket içindeki tekil testler)
├── Test Completions (test tamamlama kayıtları)
├── Parent–Student Links (veli-öğrenci bağı)
└── Invitations (davet linkleri)
```

### Kilit tablolar
- **books → book_sections → book_tests**: Bir kitap ünitelere, üniteler tekil birimlere ayrılır. İlerleme takibinin en küçük birimi bir "birim"dir: test takipli kitapta bir test, **sayfa takipli kitapta tek bir fiziksel sayfa** (R4/022). Sayfa = satır olduğu için aynı sayfa iki kez sayılamaz ve bölüm yüzdesi (43/56 = %77) doğrudan satır sayımından çıkar.
- **student_book_targets**: Bir kitap atamasının tek aktif hedefi — başlangıç/bitiş tarihi + kapsam (`whole_book` / `sections` / `units`). Plan matematiği kitabın tamamı yerine bu kapsamdan beslenir.
- **video_watch_marks**: Kitap veya bölüm videosunun "izledim" işareti. Video plan temposuna **dahil değildir** ve öğretmen onayı gerektirmez.
- **student_book_assignments**: Bir kitabı bir öğrenciye, bir döneme bağlar (başlangıç/hedef bitiş tarihiyle).
- **homework_batches / homework_items**: Öğretmen bir "ödev paketi" oluşturur (son teslim tarihli), içine birden çok test koyar. Öğrenci her testi tek tek tamamlar.
- **test_completions**: Bir testin tamamlanmasının kalıcı kaydı. `source` alanı ödevden mi manuel mi geldiğini tutar. Kısmi benzersiz indeks sayesinde bir (atama, test) çiftinin yalnızca **tek bir aktif tamamlaması** olabilir; geri alma (`reverted`) desteklenir.

### Sınav türleri ve kitap havuzu
Öğrenciler `TYT / AYT` ile etiketlenir. Kitaplar R4'ten itibaren **seviye / sınav türü** (`9-12. Sınıf, TYT, AYT, TYT+AYT, LGS, ALES, DGS`) taşır; eski `exam_type` kolonu geriye dönük uyum için korunur ve `derive_exam_type` ile bundan türetilir.

Kitap havuzu **dönemden bağımsızdır** (021): `books.academic_term_id` opsiyoneldir, dönem bağı yalnızca öğrenciye atama anında (`student_book_assignments`) anlamlıdır. Aynı kitabın 2025 ve 2026 baskısı ayrı kayıtlardır (`edition_year`); `duplicate_book_as_edition` eski kaydı ezmeden yeni baskı üretir.

---

## 4. Özellikler (Ekran Ekran)

### Öğretmen Paneli
- **Dashboard** — Tüm öğrencilerin genel bakış tablosu, risk durumu göstergesiyle.
- **Eğitim dönemleri (Terms)** — Dönem oluşturma/yönetme (taslak / aktif / tamamlandı / arşiv).
- **Kitap havuzu** — Arama + ders / seviye-sınav / yayın / baskı yılı / takip türü filtreleriyle 100+ kaynağı taşıyan kalıcı kütüphane; tek işlemde bölüm + birim yapısıyla kitap oluşturma (`create_book_with_sections_and_tests` RPC). `/teacher/books/export` ile CSV/JSON yedek.
- **Kitap detay / düzenleme** — Kitabın bölüm/birim ağacı, meta veri düzenleme, sayfa kitaplarında "Bölüm + sf. 1-56" girişi (`create_page_section`), yeni baskı oluşturma.
- **Kitap Haritası** — Test kitaplarında bölüm × test matrisi; sayfa kitaplarında bölüm bazlı tablo (Kapsam / Tamamlanan / Ödevde-Onay / Kalan / %). Kalan aralıklar onaylı sayfalardan otomatik türetilir.
- **Hedef** — Öğrenci-kitap başına tek aktif hedef: tarih aralığı + kapsam (tüm kitap / seçili bölümler). Kapsam değişince plan matematiği yeniden hesaplanır.
- **Öğrenci listesi** — Risk durumu rozetleriyle öğrenciler.
- **Öğrenci oluşturma / detay** — Sekmeli görünüm: Kitaplar / Ödevler / Veliler.
- **Kitap atama** — Öğrenciye dönem bazlı kitap atama dialoğu.
- **Haftalık Plan / Ödev oluşturma (HomeworkBuilder)** — Atanmış kitaplardan test veya sayfa aralığı (`1-36, 42-48`) seçip son teslim tarihli ödev paketi kurma; taslak otomatik kaydedilir. "Ödev metnini kopyala" test + sayfa + video görevlerini tek, sıkıştırılmış WhatsApp mesajına çevirir (`1,2,3,4,5. Test → 1-5. Test`).
- **Davet oluşturma** — Öğrenci veya veli için tek kullanımlık, süreli, e-postaya bağlı davet linki.
- **Öğrenci ilerleme raporu** — `/teacher/students/[id]/report`, mevcut görünümlerden üretilen yazdırılabilir/PDF rapor.

### Öğrenci Paneli
- Kişisel ödev listesi; her test için **"Tamamladım / Geri Al"** aksiyonu.
- Atanmış kitaplarda salt okunur Kitap Haritası, tempo şeridi ve ilerleme görünümü.
- Video kaynakları: bağlantı + öğretmen onayı gerektirmeyen **"İzledim"** işareti.

### Veli Paneli
- Çocuğun ilerleme ve ödev durumunun salt-okunur zengin özeti.

### Davet Akışı
- `/invite/[token]` — Davet linkini kabul etme sayfası; kayıt/giriş sonrası ilgili role otomatik bağlama.

### Pazarlama / Demo
- Landing sayfası (hero, özellikler, nasıl çalışır, istatistikler, footer).
- `/demo` — Öğretmen/öğrenci/veli panellerini sekmeli canlı önizleyen interaktif demo.

---

## 5. Raporlama Görünümleri (DB Views)

Ağır sorgular veritabanı görünümlerine taşınmıştır:

- **student_book_progress_view** — Öğrenci başına kitap ilerlemesi (% tamamlanma).
- **student_weekly_homework_summary_view** — Haftalık ödev özeti.
- **teacher_student_overview_view** — Öğretmen dashboard'unun beslediği genel bakış.

### İş mantığı RPC fonksiyonları
`create_teacher_workspace`, `create_book_with_sections_and_tests`, `assign_book_to_student`, `create_homework_batch`, `mark_homework_item_completed`, `revert_homework_item_completion`, `accept_invitation` — Çok adımlı işlemler atomik olsun ve RLS'i güvenli aşsın diye sunucu tarafı fonksiyonlara alınmıştır.

---

## 6. Teknik Mimari

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 15.5 (App Router) + React 18 + TypeScript |
| Stil | Tailwind CSS v4 + shadcn/ui (base-nova, `@base-ui/react` primitifleri) |
| Backend / DB | Supabase (Auth + PostgreSQL + RLS + RPC) |
| Formlar | react-hook-form + Zod v4 + `@hookform/resolvers` v5 |
| UI yardımcıları | lucide-react (ikon), sonner (toast), TanStack Query |
| Deploy | Vercel |

### Mimari ilkeler
- **Server Actions** ile mutasyonlar (`actions.ts` dosyaları); tüm girdiler sunucuda **Zod ile** doğrulanır (`lib/validation.ts`).
- **Row Level Security (RLS)** her tabloda; veri izolasyonu `workspace_id` üzerinden. Öğrenci/veli okuma izni `is_student_self` ve `is_parent_of_student` yardımcılarıyla verilir.
- **Saf mantık modülleri** (`lib/`): `plan-pace` (tempo/plan çizgisi), `plan-scope` (hedef kapsamı), `page-ranges` (aralık birleşimi/farkı), `share-text` (WhatsApp metni), `homework-status` (durum türetme), `book-map` (harita yükleyici). Her biri tek sorumluluk taşır ve birim testlidir; UI katmanı kendi kopyasını üretmez.
- **Middleware** (`middleware.ts`) ile rota koruması; `/api/health` gibi public rotalar hariç.
- Ham veritabanı hataları kullanıcıya sızmaz — Türkçe'ye çevrilir (`lib/auth-errors.ts`).
- Hata gözlemlenebilirliği: `lib/observability.ts` `reportError` dikişi + error boundary'ler.

### Dosya yapısı
```
app/(auth)/          login, register, actions
app/(dashboard)/
  teacher/           dashboard, terms, books, students, report
  student/           panel, homework-list, actions
  parent/            salt-okunur panel
app/invite/[token]/  davet kabul
app/demo/            interaktif demo
app/api/health/      health check
components/          teacher | student | parent | shared | ui | marketing
lib/                 workspace, invite, validation, auth-errors, observability, supabase/
supabase/migrations/ 001–044
```

---

## 7. Güvenlik ve Kalite

- **Güvenlik:** Sunucu tarafı Zod doğrulaması, RLS izolasyonu, ID doğrulama, davetlerin e-postaya bağlanması (`008`), hata mesajı sızıntısının kapatılması, savunmacı sorgu limitleri.
- **Testler:** Vitest v3 ile `tests/` altında birim testleri; Playwright ile `e2e/smoke.spec.ts` uçtan uca duman testi (prod build'e karşı geçiyor).
- **CI:** GitHub Actions — `typecheck` + `test` + `build`.
- **Erişilebilirlik/Mobil:** Sidebar a11y (aria-current/expanded, Escape ile mobil menü kapatma), mobil uyumlu düzen.

### Komutlar
```bash
npm run dev        # geliştirme sunucusu
npm run build      # üretim derlemesi
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
npm run e2e        # playwright
```

---

## 8. Mevcut Durum

MVP ve MVP sonrası kalite fazları (P1–P4) **tamamlandı**: kimlik doğrulama, üç rolün panelleri, kitap/ödev/test takibi, davet akışı, ilerleme raporu, testler ve CI kuruludur.

R2–R7 revizyonları uygulanmıştır: durum etiketleri (R2), Kitap Haritası + haftalık plan çalışma masası (R3), kitap havuzu ölçekleme + sayfa bazlı takip + hedef kapsamı + video + WhatsApp çıktısı (R4), öğrenci kaynak planı + müfredat akışı + koruma havuzu (R5), gerçek kullanım ve kaynak yönetimi (R6), kitap havuzu yapısı + tek Kitap Haritası (R7). 44 veritabanı migration'ı çalıştırılmıştır (001–044).

### R7 — Kitap Havuzu yapısı ve tek Kitap Haritası

**Kaynak → Parça → Bölüm (042).** MÖF, Kondisyon, AllStar gibi fasiküllü kaynaklar artık ayrı kitap açılmadan tek kaynağın altında durur: `book_parts` tablosu + `book_sections.part_id`. Parça bir **gruplama katmanıdır**, takip birimi değildir — öğrencide tek plan ve tek toplam ilerleme yüzdesi korunur. R6-17'nin serbest metin `group_label`/`theme_label` alanları UI'dan kaldırıldı; kolonlar ve verileri **duruyor** (kör otomasyonla dönüştürülmedi), düzenleme ekranında "eski etiket" ipucu olarak görünür.

**Kaynak Türü ve Kaynak Yapısı (042).** `books.resource_type` (Soru Bankası, Video Destekli Defter, Kamp Kitabı, …) yalnız sınıflama, filtre ve kart etiketidir; hiçbir hesaba girmez ve aynı türden ikinci kitabı engellemez. `books.structure_kind` = `single` | `multi`.

**Takip türü beşe çıktı:** `test | page | section | step | trial`. Yeni tür ≠ yeni tablo — her birim yine bir `book_tests` satırıdır (022); değişen yalnız birimin adıdır (`lib/unit-labels.ts`).

**Video Desteği → Video Kullanımı.** Soru bankasının çözüm videosu ile VDD'nin ders akışı ayrıldı: `none | solution_videos | video_course | mixed`. Eski `book`/`section` değerleri geçerli kalır ve listede "(eski)" olarak görünür.

**0 ilerlemeli kaynakta yapı kilidi açıldı.** Tek ölçüt `book_has_progress()`: kaynakta ödev veya aktif tamamlama kaydı yoksa takip türü (`set_book_tracking_mode`) ve bölüm sayfa aralığı (`set_section_page_range`) düzeltilebilir. İlerleme başladıysa yapısal alanlar kilitli kalır, isim/açıklama/video düzenlenebilir. Yeni Kitap formunda **Enter artık kaydetmez**.

**Müfredat eşleştirmesi (043).** Bölüm birden fazla konuya bağlanabilir (`book_section_topics`); liste kitabın ders + seviye/sınav bilgisine göre filtrelenir ve aranabilir çoklu seçimle sunulur (`components/shared/topic-multi-select.tsx`). `book_sections.topic_id` **birincil eşleme** olarak korunur ve listenin ilk elemanıyla senkron tutulur — R5.3 müfredat sinyali bozulmadan çalışır. Eşleme zorunlu değildir ve bölümün tamamlanması konuyu otomatik "öğrenildi" yapmaz.

**Tek Kitap Haritası (R6-03 güncellemesi).** Ödev verme ve yönetim aynı akademik verinin farklı işlemleridir; ikisi `/teacher/students/[id]/homework/new` yüzeyinde birleşti. Harita `manage` modunda çalışır (altı durum da seçilebilir), altındaki işlem çubuğunda **Ödeve Ekle / Tamamlandı Olarak İşle / Onayla / Tamamlanmayı Geri Al** vardır ve her düğme kaç öğeye uygulanacağını söyler. Kritik ayrım: **seçim tek başına veri durumunu değiştirmez** — harita seçimi (`mapSelection`) ile plan sepeti (`basketIds`) ayrı kümelerdir. Yayından sonra aynı haritada kalınır. Kitap detayındaki Kaynak Haritası salt görünüme indi ve "Bu kitapta çalış" ile bu yüzeye yönlendirir.

**WhatsApp çıktısı (R7-01…04).** Teslim tarihi "31 Ağustos 2026 Pazartesi (7 gün sonra)" (Bugün/Yarın destekli, R6-02'nin yerel gün semantiğiyle); kitap başlıkları miktar taşır ("345 Matematik (1 test)"); hiyerarşi öğrenci → tarih → kitap + miktar → çalışma → not → hatırlatma. Haftalık plan sepeti `lg` kırılımından itibaren sticky ve kendi içinde kayar; "Planı Yayınla" uzun listede erişilebilir kalır.

### R6 denetimi (R7 sonrası)

R6 Teknik Teslim Dokümanı'nın 18 maddesi R7 sonrası kod üzerinde yeniden denetlendi. 12 madde (R6-01, 02, 04, 05, 07, 08, 09, 10, 11, 12, 14, 15, 16) uygulanmış durumda; **R6-03 ve R6-17 R7 ile değiştirildi** (tek Kitap Haritası ve `book_parts` — R7 dokümanı R6-03'ün yerine geçtiğini açıkça yazar). **R6-13 (kitap kapağı) kullanıcı kararıyla kapsam dışıdır** ve bu denetimde de kapsam dışı bırakıldı.

Denetimde çıkan beş boşluk kapatıldı:

- **R6-06 öğrenci tarafı** — `lib/homework-detail.ts` öğretmen ve velide kullanılıyordu ama öğrencinin kendi ödev listesi kendi gruplamasını kurup 71 sayfayı 71 satıra açıyordu. Artık aynı merkezî formatter'dan tek satırlık aralık özeti üretiliyor ("Polinomlar → 3-5. Test · Üslü Sayılar → sf. 6-26, 61-81"); kalem satırları ve tek tek "Tamamladım" davranışı korundu.
- **R6-18 kabul #95** — sepet kalıcılığının hiç testi yoktu. Taslak şeması `lib/validation.ts`'e (`weeklyPlanDraftSchema`), sepet→yayın dönüşümü `lib/weekly-plan.ts`'e (`resolveBasketItems`, `toHomeworkItems`) taşındı ve test edildi. Silinmiş kitaptan kalan hayalet id artık yayına gitmiyor, tekrarlı id tek kalem üretiyor.
- **R6-18 kabul #94** — reddetme notunun görünürlük sözleşmesi teste eklendi (not yalnız "İade Edildi" durumunda görünür). Notun yazılması/temizlenmesi DB tarafındadır (`014`/`020`) ve manuel kabul adımıdır.
- **Yeni baskı kopyalama (044)** — `duplicate_book_as_edition` 021'den beri güncellenmemişti; öğretim programı, Kaynak Türü/Yapısı, Parça hiyerarşisi, müfredat eşlemeleri ve bölümlerin sayfa kapsamı kopyalanmıyordu. Hepsi kopyalanıyor; öğrenci ilerlemesi hâlâ kopyalanmıyor.
- **Müfredat filtresi kaçışı** — kitabın ders/seviyesine uyan kapsam yoksa konu listesi boş kalıyor ve eşleme imkânsız hâle geliyordu. Artık tüm konulara düşülüyor ve kullanıcıya bildiriliyor (R6-15'in "filtre kısıtlamaz" ilkesi).

R7'den sonra çağrılmayan iki sunucu eylemi (`setSectionGroupingAction`, `setSectionTopicAction`) kaldırıldı; karşılık gelen RPC'ler geri alma yolu için veritabanında kaldı.

**R7 sonrası bekleme listesi:** reddedilen ödevde öğrenciye geri bildirim metni; öğrenci mobil ödev ekranının kompakt revizyonu; veli panelindeki tempo göstergelerinin sadeleştirilmesi; aynı kitapta ardışık çoklu hedefler (Hedef 2/3) için UI; toplu kitap içe aktarma. **R7-02 dışında bırakılanlar** (bilinçli): otomatik kaynak öneri motoru, %70 ilerleme eşiği, konu eşiği ile kaynak başlatma, kaynak zorluk puanları, zorunlu tam müfredat eşleştirmesi.
