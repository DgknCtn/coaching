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
supabase/migrations/ 001–051
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

R2–R7 revizyonları uygulanmıştır: durum etiketleri (R2), Kitap Haritası + haftalık plan çalışma masası (R3), kitap havuzu ölçekleme + sayfa bazlı takip + hedef kapsamı + video + WhatsApp çıktısı (R4), öğrenci kaynak planı + müfredat akışı + koruma havuzu (R5), gerçek kullanım ve kaynak yönetimi (R6), kitap havuzu yapısı + tek Kitap Haritası (R7). 51 veritabanı migration'ı çalıştırılmıştır (001–051).

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

### UI referans uyarlaması — Müfredat Akışı ve Koruma Havuzu

Her iki ekran da kurallarını kullanıcıya anlatmak zorunda ("son temas ne sayılır?", "sıralama neye göre?", "renk ne demek?") ve bu bilgiler altta tek bir uzun paragraf olarak duruyordu. İkisi de aynı kalıba bağlandı:

- **Renk açıklaması** (`components/shared/legend.tsx`) tablonun üstünde; renk tek başına anlam taşımaz, her örnek noktanın yanında adı yazar. Koruma Havuzunda banda gün aralığı da eklendi (30+ / 14-29 / 0-13).
- **Detay paneli** (`components/shared/detail-panel.tsx`) — listede bir satır seçilince masaüstünde sağda sticky kart, `lg` altında alttan drawer. Seçim yalnız görünüm durumudur; kayıt havuzdan/akıştan çıkarsa panel kendiliğinden kapanır.
- **Açıklama kartları** (`components/shared/explainer-cards.tsx`) alt paragrafın yerine geçti; kurallar madde madde, olumlu/olumsuz ayrımı ikon tonuyla.
- **Müfredat Akışı zaman çizelgesi** (`components/shared/flow-timeline.tsx`) — konuların birbirine göre nerede durduğunu gösteren hafta ızgarası. SALT GÖRÜNÜMDÜR: sürükleme yoktur, çünkü taşıma zincirleme kaydırma yapar ve piksel sürüklemesi yanlış beklenti yaratır.
- **Koruma Havuzu ders sekmeleri** elle yazılmış nav+Link yerine `components/shared/link-tabs.tsx`; sekmeler gerçek bağlantı olduğu için paylaşılabilir ve geri tuşuyla gezilebilir. Havuz özetine "Ortalama temas süresi" eklendi (`summarizePool` zaten hesaplıyordu, ekranda yoktu).

R7'den sonra çağrılmayan iki sunucu eylemi (`setSectionGroupingAction`, `setSectionTopicAction`) kaldırıldı; karşılık gelen RPC'ler geri alma yolu için veritabanında kaldı.

### UI referans uyarlaması — Kaynak Planı

- **İki yüzde yan yana** (§3.2). Kart tek ilerleme barı gösterip kitap kapsamını dipnota atıyordu; bu "plan bitti = kitap bitti" yanılgısını besliyordu. Artık Plan ve Kitap kapsamı iki ayrı barla, kendi sayılarıyla yan yana duruyor. Tekrar eden "Plan kapsamı" hücresi kaldırıldı, yerine "Seçili kapsam" geldi.
- **Durum rozeti** — kaynak durumu düz metindi, artık grup kovasıyla aynı indirgemeden gelen renkli rozet (Aktif / Bekliyor / Hedefi tamamlanan).
- **Açıklama kartları** alt paragrafın yerine: "İki yüzde neden farklı?", "Neler plana girmez?", "Tempo ve hedefler".
- **Kaynak Ekle** ekranın kendi başlığına taşındı; eksik kaynak burada fark ediliyor, öğretmen genel bakışa dönmek zorunda kalmıyor. Atanabilir kitap sorgusu iki ekranda kopyalanmasın diye `lib/assignable-books.ts`'e çıkarıldı (öğrenci genel bakışı da artık oradan besleniyor).

### Kitap Haritası lejantı — bölüm işaretleri

Bölüm başlığındaki ● müfredat sinyali (R5.3 §5.2) ve "Plan dışı" etiketi hiçbir yerde tanımlanmıyordu: kullanıcı işareti görüyor ama karşılığını bilmiyordu. `BookMapLegend` artık isteğe bağlı `book` alır ve bu iki işareti, **yalnız o kitapta gerçekten çiziliyorlarsa**, test durumlarından ayırıcı bir çizgiyle ayrılmış olarak açıklar. Sinyalin görünümü iki haritada farklı olduğu için lejant örneği de farklıdır: test haritasında ●, sayfa haritasında kalın bölüm adı.

### Kitap Haritası bölüm satırı menüsü

Bölüm satırında bugüne kadar hiçbir eylem yoktu: öğretmen haritaya bakarken "bu konuyu ders olarak işledim" demek için Koruma Havuzu ekranına gidip konuyu listede yeniden bulmak zorundaydı. Eylemler zaten vardı, erişim yeri yoktu. `components/shared/section-row-menu.tsx` üç eylem taşır:

- **Aktif tut ⇄ Koruma havuzuna al** — tek toggle. Ayrı bir "havuza al" RPC'si YOKTUR; havuz temaslardan türetilir, konuyu havuzun görüş alanına sokmak `student_topic_overrides` satırını silmek demektir (041 §6.5). Bayrağın yönü `lib/topic-overrides.ts` ile yüklenir.
- **Ders işlendi olarak işaretle** — `add_topic_contact(kind='lesson')`. Koruma havuzu sıralamasını değiştirdiği ve bu ekranda geri alma yolu olmadığı için onay sorulur.
- **Not ekle** — öğrenciye özel BÖLÜM notu için tablo yok; not öğrencinin akademik notlarına `"{kitap} / {bölüm} — "` ön ekiyle yazılır. Ön ek de 2000 karakter sınırından düşülür.

**Menüde bilinçli olarak olmayan:** "Plana dahil et / Plan dışı bırak". Hedef kapsamı bölüm id listesi olarak replace semantiğiyle saklanıyor; tek bölümü açıp kapamak "tüm kitap" hedefini önce listeye çevirmeyi ya da birim listesi hedefinde karşılığı olmayan bir dönüşümü gerektirirdi. Kapsam düzenlemesi Hedefler kartında tek yerde kalır.

Menü `readOnly`ye BAĞLANMADI: `readOnly` "hücre seçilemez" demektir (ödev atama tek yüzeyde, R7), oysa menüdeki eylemler konu bazlıdır ve öğretmenin salt okunur Kaynak Haritasında da anlamlıdır. Görünürlüğü `studentId` prop'u belirler; öğrenci ve veli sayfaları bu alanı geçmez. Konusu eşlenmemiş bölümde (`topic_id` nullable, 040) konu bazlı iki eylem devre dışıdır ve nedeni menüde yazar.

### Müfredat Akışı — beş durum, satır menüsü, sürükleme

**Durum kümesi 3'ten 5'e çıktı** ve iki katmana ayrıldı. Ayrım kasıtlıdır:

- `deriveFlowStatus(item, today)` SAF ve kalem bazında kalır; yalnız `passed` / `current` / `later` döndürür. `lib/curriculum-signal.ts` onu Kitap Haritasındaki müfredat sinyali için kullanıyor ve orada liste bağlamı yok — sinyal yalnız `current`e baktığı için yeni durumlar o davranışı **değiştirmez**.
- `deriveFlowStatuses(items, today, activeTopicIds)` liste düzeyinde iki yükseltme yapar: konuda **açık çalışma** varsa `in_progress` (tarihten bağımsız — öğrenci planın önünde olabilir), başlamamış konulardan **sıradaki ilki** `soon`. Öncelik `passed` > `in_progress` > tarih. "Yaklaşan" için hafta eşiği kullanılmadı: 40 haftalık akışta "önümüzdeki 4 hafta" bazen hiçbir satırı, bazen üçünü yakalar; "sıradaki konu" her akışta tam olarak bir sonrakini gösterir.

`upcoming` → `later` olarak yeniden adlandırıldı, etiketler referansa göre güncellendi (Tamamlandı / İşleniyor / Zamanı Geldi / Yaklaşan / Sonrasında). `passed_at` alanı ve `setPassed` fonksiyon adı **değişmedi** — veri sözleşmesine dokunulmadı.

**"İşleniyor" verisi** `lib/open-work.ts` ile gelir; sorgu Koruma Havuzu ile ORTAK. İki ekran "bu konuda açık çalışma var mı?" sorusuna farklı yanıt veremez: havuzda "aktif çalışmada" sayılan konu akışta da "İşleniyor" görünür.

**Böl ve Birleştir** (`splitItem`, `mergeWithNext`) eklendi. İkisi de toplam zaman aralığını korur, bu yüzden **devam bloklarını kaydırmazlar** — bölme/birleştirme zincirleme etki yaratmaz. Bölmede ikinci parça `id: null` ile eklenir ve adı aynı kalır; kayıtta `upsert_topic` aynı topic id'yi döndürür ve aynı konu iki satır olur. 039 migration'ı `(student_id, scope_id, topic_id)` unique kısıtını tam da bunun için koymamıştı. `passed` yalnız ilk parçada kalır; birleştirmede ise ancak ikisi de tamamlanmışsa korunur.

**Çizelgede sürükleme.** `flow-timeline.tsx` önce bilinçli olarak sürüklemesizdi; gerekçe "zincirleme kaydırma var, piksel sürüklemesi yanlış beklenti yaratır" idi. Gerekçe geçersiz kılınmadı, **karşılandı**: sürüklerken zincirleme sonucun kendisi canlı çizilir ve alt şeritte "+3 hafta — devam blokları da kayıyor" yazar. Gövde taşır, sağ kenar süreyi değiştirir; ikisi de hafta sütununa snap eder. Sonuç yalnız bırakınca uygulanır ve "Akışı Kaydet" ile kaydedilir. Sürükleme **tek yol değildir**: aynı işlemler satır menüsünde durur, klavye kullanıcısı onlarla çalışır. Kaydedilmemiş blok sürüklenemez.

**Satır menüsü** dört ikon düğmenin yerine geçti (İleri/Geri taşı · Böl · Birleştir · Konu ekle öncesine/sonrasına · Tamamlandı yap · Konuyu çıkar). Böl ve Birleştir eklenince satırda altı düğme olacaktı; menü ayrıca her komutun adını yazar. **Durum kolonu kaldırıldı**, durum noktası konu adının başına geldi. Başlık şeridine "Toplam süre" kartı, sağ kolona beş durumun hafta toplamını veren "Akış özeti" kartı eklendi; detay paneline "Bu hafta" ve "İlerleme" satırları geldi.

`tests/curriculum-flow.test.ts` 20'den 44 teste çıktı: MA-05…MA-11 kabulleri değişmeden geçiyor (yeniden adlandırmanın regresyon güvencesi), yeni durum türetmesi ile Böl/Birleştir sınır değerleriyle test edildi.

### Davet sistemi — yaşam döngüsü ve güvenlik (045)

Davet akışı çalışıyordu ama üç boşluğu vardı; ikisi güvenlik.

**1. Veli daveti hiçbir kimliğe bağlı değildi.** `invite-actions.ts` veli için `invited_email: null` yazıyordu ve `024`'teki e-posta doğrulaması `invited_email IS NOT NULL` koşuluna bağlı olduğu için veli davetinde hiç çalışmıyordu: linki eline geçiren herkes kendi e-postasıyla hesap açıp öğrencinin verisine `parent` olarak erişebiliyordu.

Öğretmen çoğu zaman veli e-postasını bilmediği için alan **zorunlu yapılmadı**; girilirse davet o adrese kilitlenir. Girilmediğinde tek koruma penceredir, bu yüzden **veli daveti 48 saat**, öğrenci daveti (zaten öğrencinin kayıtlı e-postasına kilitli) 7 gün geçerlidir. Dialog hangi durumda olduğunu açıkça yazar: "yalnız belirtilen e-posta ile kullanılabilir" ya da "herhangi bir e-postayla kullanılabilir — yalnız doğru kişiye gönderin".

**2. İptal (revoke) uygulanmamıştı.** `'revoked'` statüsü 001'den beri CHECK'te ve `/invite/[token]` sayfasında mesajı hazırdı ama bu değeri yazan tek satır kod yoktu — yanlış kişiye giden link 7 gün geri alınamıyordu. Artık `revokeInviteAction` var ve **yeni davet eskisini otomatik iptal eder**; 045'teki partial unique index (`(student_id, role) WHERE status='pending'`) bunu veritabanı düzeyinde de zorunlu kılar. Migration, index'ten önce mevcut çoklu `pending` kayıtları temizler (her çift için en yenisi kalır).

**3. Bekleyen davetler görünmüyordu.** `invitations` tablosunu okuyan hiçbir öğretmen ekranı yoktu; "davet gönderdim mi, kaç tane açık, kabul edildi mi?" sorusunun arayüzde cevabı yoktu. Öğrenci detayındaki Veliler sekmesine davet listesi eklendi: rol, kilitli olup olmadığı, gönderim tarihi, kalan süre, durum rozeti ve iptal düğmesi.

**PII sızıntısı kapatıldı.** `get_invitation_by_token` filtresizdi ve kullanılmış/süresi dolmuş bir link bile öğrencinin tam adını anonim çağırana döndürüyordu. `024` bunu bilinçli olarak düzeltmemiş ve gerekçesini yazmıştı (ekran `status` alanına bakıp mesaj ayrımı yapıyor). O itiraz **karşılandı**: `status`, `role` ve `expires_at` her zaman döner, yalnız kimlik alanları davet gerçekten kullanılabilir durumdayken dolu gelir.

**Görünen durum türetmesi** `lib/invite-status.ts`'te ve testlidir. Gerekçe: `expired` statüsünü yazan tek yer `accept_invitation`'dır ve o da ancak biri linki açmayı denediğinde çalışır — süresi dolmuş davetler tabloda `pending` durur, liste bunu kendi başına anlamak zorundadır.

**Kabul akışı hata mesajı.** Hesabı olan davetli yanlış şifre girdiğinde "E-posta veya şifre hatalı." görüyor ve davetin mi bozuk olduğunu yoksa şifresini mi yanlış yazdığını anlayamıyordu. Artık ayrı mesaj ve şifre sıfırlama bağlantısı gösterilir.

Ölü klasör `app/(auth)/invite/[token]/` silindi (boştu, kullanılmıyordu).

### Öğrenci ekranları — Akışım ve Tekrar (046)

Denetimde tuhaf bir asimetri çıktı: **öğrenci kendi velisinden az bilgi görüyordu.** Veli haftalık özeti ve plan/tempo kartlarını görebiliyor, öğrenci ise yalnız "bu hafta ne yapacağım"ı görüyordu; müfredat akışı, koruma havuzu ve kaynak planının hiçbirinin öğrenci karşılığı yoktu.

**046 — RLS.** 038/039/041'de kurulan tablolar `FOR ALL` + teacher-only politikayla açılmıştı; o gün yalnız öğretmen ekranları vardı. Migration mevcut politikalara **dokunmadan** yalnızca SELECT veren ayrı politikalar ekler (permissive politikalar OR'lanır). Kapsam bilinçli olarak dar: yalnız `SELECT`, yalnız kendi satırları, **veliye verilmez**. `topics` ve `academic_scopes` erişimi de öğrencinin kendi akışında ya da kendi kitaplarında geçen kayıtlarla sınırlandı — çalışma alanının tüm müfredat sözlüğü açılmadı.

**`/student/curriculum` — "Akışım".** Öğretmen ekranıyla **aynı veri, aynı türetme** (`deriveFlowStatuses` + `lib/open-work.ts`): iki ekranın birinde "İşleniyor" diğerinde "Zamanı Geldi" demesi kabul edilemez. `FlowTimeline`'a `onChange` verilmez → sürükleme kapalı; satır menüsü ve süre kontrolü hiç render edilmez. Akış eğitmenin planıdır (R5.2 §4.4); arayüz RLS'in çizdiği sınırın aynısını çizer.

**`/student/review` — "Tekrar".** Koruma Havuzunun öğrenci sürümü: aynı satırlar, aynı `buildProtectionPool`, farklı dil. Bant etiketleri "Öncelikli / Takipte / Normal" yerine "Uzun süredir dokunmadın / Yaklaşıyor / Yeni çalıştın"; "radar" metaforu "unutmamak için" diye anlatılır. Bant **eşik değildir** ve öğrencide de değildir — hiçbir şeyi tetiklemez, "bunu yapmak zorundasın" demez. Tek eylem, konunun çalışıldığı kitabın haritasına gitmektir.

**`lib/protection-pool-rows.ts`.** Havuz satırlarını kuran ~80 satırlık blok öğretmen sayfasından `lib/`'e taşındı; iki ekran aynı yerden beslenir. Öğretmen sayfası 197 satırdan 66 satıra indi.

**Mevcut öğrenci ekranlarının açıkları da kapatıldı:** haftalık özet öğrenci ana ekranına eklendi (veli panelinin kullandığı görünümün aynısı); hiç kitap atanmamışsa ekran sessizce boş kalıyordu, artık `EmptyState` var; mobilde etiketi gizlenen tarih alanına `aria-label` eklendi; öğrenci segmentine kendi `loading.tsx`'i geldi.

**Sayaç adları role duyarlı oldu.** Durum etiketleri (`testStateLabel`) role göre çevriliyordu ama sayaç adları çevrilmiyordu: öğrenci kendi kitap sayfasında "Öğrenciden Beklenen" ve "Onay Bekleyen" yazan, öğretmen ağzından kurulmuş cümleler görüyordu. `counterLabel(key, audience)` eklendi ve `StatusAudience`'a **`'parent'`** katıldı — veli ne öğretmene emir veren ne de öğrenciye seslenen bir üçüncü kişidir; önceden veli ekranı `audience="student"` ile çağrılıyor ve veliye "Yapılacak" deniyormuş gibi okunuyordu.

### Veli paneli — sadeleştirme (bekleme listesi maddesi kapandı)

Veli **salt okunur kalır**; hiçbir server action eklenmedi ve RLS'te veliye yazma hakkı verilmedi.

**Tempo göstergeleri sadeleşti.** Veli bugüne kadar öğretmenle BİREBİR aynı `PlanTempoCard`'ı görüyordu: başlangıç temposu, gerekli tempo, kalan hafta, hedef tarih, yüzde. Oysa veli bu sayılarla bir karar vermiyor — ödev atamıyor, hedef değiştirmiyor. Sorusu tek: "iyi gidiyor mu, gitmiyorsa ne kadar geride?" `ParentTempoRow` **aynı hesabı** (`calculatePlanTempo`) kullanır ama çıktı tek cümleye iner: "Hedefe göre iyi gidiyor · 4 test/hafta yeterli" ya da "Hedefe yetişmek için 9 test/hafta gerekiyor". Kart yığını yerine kitap başına bir satır.

**Çoklu çocuk.** `parent_student_links` N öğrenciye izin veriyor ama arayüz hepsini alt alta diziyordu; üç çocuklu bir velide sayfa taranamaz hâle geliyor ve her çocuk için üç sorgu birden çalışıyordu. Artık tek çocuğun detayı gösterilir, geçiş `LinkTabs` ile yapılır ve seçim `?student=` ile URL'de tutulur (paylaşılabilir, geri tuşuyla gezilebilir). **Tek çocukta sekme hiç çizilmez.**

*Not: plan `StudentSwitcher`'ı bağlamayı öngörüyordu; o bileşen `/teacher/students/<id>` yolunu yeniden yazmak üzere kurulmuş ve veli rotasına uymuyor. `LinkTabs` zaten "URL tabanlı seçim" kalıbının kendisi ve diğer üç ekranda kullanılıyor — ikinci bir mod eklemek yerine o kullanıldı.*

**Video paneli artık durum gösteriyor.** İzlenenler kümesi `new Set()` olarak geçiliyordu, yani liste durumsuzdu. Veli `video_watch_marks` üzerinde zaten SELECT hakkına sahip (023); işaretler gerçekten yükleniyor ve **salt okunur** gösteriliyor ("İzlendi" / "Henüz izlenmedi"). İşaretleme yalnız öğrencinin eylemi olarak kalır.

**Dil.** Veli ekranları `audience="student"` ile çağrılıyor ve veliye "Yapılacak" deniyormuş gibi okunuyordu; artık `audience="parent"`. Gecikme uyarısındaki "Öğretmeninizle iletişime geçin" düz metni öğretmenin adıyla anlamlı bir cümleye dönüştü. Ekranın nasıl okunacağını anlatan açıklama kartları eklendi (diğer üç ekranla aynı kalıp).

### R7-03 — Alt Bölüm ve Test Aralığı (047, 048)

Gerçek vaka: 3D TYT Matematik'te **01. Bölüm tek başına ~200 sayfa** ve içinde Temel Kavramlar, Üslü Sayılar, Problemler gibi ~30 ayrı ödev birimi var. Test numarası bölüm içinde 1-96 ilerliyor ama TÜMEVARIM bloklarında yeniden 1'den başlıyor. "Bölüm + Test Sayısı" modeli bunu temsil edemiyordu: öğretmen **"Üslü Sayılar Test 44-48"** ödevi veremiyordu.

**Hiyerarşi:** `Kaynak → Parça? → Bölüm → Alt Bölüm? → test`. Alt Bölüm opsiyoneldir; alt bölümü olmayan kitaplar bugünkü gibi çalışır.

**Test adedi girilmez**, `Son - İlk + 1` olarak hesaplanır. `test_start/test_end` yalnız bilgi değil **üretim girdisidir**: `book_tests.order_index = n`, `title = n || '. Test'` bu aralıktan üretilir. Böylece `order_index` bu kayıtlarda "kitapta yazan test numarası" anlamını kazandı; bugüne kadar hem sıra hem numara olarak çift anlamlıydı.

**Neden ayrı tablo değil, `book_sections.parent_section_id`:** belirleyici olan `book_tests` üzerindeki `UNIQUE (section_id, order_index)` kısıtıdır. Şartname "aynı basılı numara farklı alt bölümlerde kullanılabilir, sistem bunu çakışma görmez" diyor; alt bölüm kendi `section_id`'si olduğu için TÜMEVARIM I Test 1 ile Temel Kavramlar Test 1 **zaten ayrı satırlardır**. Ayrıca alt bölüm, bölümün sahip olduğu her şeye ihtiyaç duyar (topic_id, çoklu müfredat eşlemesi, sayfa aralığı, not, parça) — ayrı tabloda hepsi yeniden yazılırdı. Sonuç: `book_tests.section_id` hâlâ yaprağı gösterir ve `homework_items`, `test_completions`, `plan-scope`, `plan-pace`, `weekly-plan`, `bulk-actions` **hiç değişmedi**.

**Ağaç TEK yerde düzleşir.** `lib/book-structure.ts` içindeki `orderLeafSections` haritaya her zaman yaprak listesi verir; kapsayıcı bölümler satır olarak dönmez, adları `parentTitle`'da başlığa taşınır. "Bölümler düzdür" varsayımı taşıyan onlarca tüketiciye bu sayede dokunulmadı.

**Kitap Haritası:** satır artık en alt takip birimidir, Bölüm adı üstünde ayırıcı başlıktır (Parça ile aynı desen; ikisi de varsa parça üstte). Sütun başlığı **düzeltildi** — "1.Test" yazıyordu ve artık yanlış: numara yerel olduğu için tek bir başlık "Üslü Sayılar 44'ten başlar" ile "TÜMEVARIM I 1'den başlar"ı birden doğru gösteremez. Başlık sıra numarasına indi, basılı numara satır etiketindeki aralıkta ve hücrenin kendi başlığında duruyor.

**048:** `duplicate_book_as_edition` bölümleri artık **iki geçişte** kopyalar (önce üst düzey, sonra `v_section_map` ile alt bölümler) ve test aralığını taşır. 044'ün kendisi bu fonksiyonun güncellenmesi unutulduğunda ne olduğunun kayıtlı örneğiydi; aynı hata tekrarlanmadı.

**Testler:** `tests/book-structure.test.ts` 17 test. Şartnamenin kendi kontrol sayıları fixture olarak duruyor — **Bölüm 1 = 104**, kitap toplamı **177**. Alt bölümü olmayan kitabın listesinin birebir aynı kaldığı da burada kanıtlanıyor.

**R7-03 sınırı** korundu: yeni otomasyon, kaynak önerisi, konu eşiği veya pedagojik sınıflandırma eklenmedi. Bire Bir ÖSYM ve TÜMEVARIM için ayrı kaynak türü/kategori **açılmadı** — bunlar yalnızca alt bölüm adlarıdır.

### Faz 1 — Güvenlik kapanışı (049, 050)

Satış öncesi denetimde çıkan P0 ve P1 güvenlik bulguları kapatıldı.

**049 — View'ların RLS baypası (P0).** Depodaki sekiz view'ın hiçbirinde `security_invoker` yoktu ve hiçbirinde GRANT/REVOKE tanımı yoktu. View'lar PostgreSQL'de varsayılan olarak *sahibinin* haklarıyla çalışır ve alttaki tabloların RLS'ini atlar; Supabase de `public` şemasına varsayılan SELECT izni verir. Sonuç: tarayıcıda zaten görünen anon anahtarıyla `teacher_student_overview_view` çağıran biri **tüm workspace'lerin** öğrenci adlarını, sınav türlerini ve ilerlemelerini okuyabiliyordu. 003, 026 ve 046'daki RLS çalışması bu yolla tamamen aşılıyordu.

İki katman birden uygulandı: `security_invoker = on` (view artık çağıranın haklarıyla çalışır) ve `REVOKE anon` + `GRANT authenticated` (oturum açmamış istemci kapıda kesilir). İkincisi savunmanın ikinci katmanıdır — yarın bir tabloya gevşek politika yazılırsa anon yine de giremez.

**Zorunlu yan düzeltme:** `topic_contacts`'a öğrenci self-SELECT politikası eklendi. Öğrencinin Tekrar ekranı bugüne kadar çalışıyordu **çünkü view RLS'i baypas ediyordu** — yani sızıntı, eksik bir politikayı örtüyordu. 046 bu tabloyu "zaten view üzerinden geliyor" gerekçesiyle açmamıştı; o gerekçe view kapanınca geçersiz kaldı.

`tests/tenant-isolation.test.ts` bu açığı otomatik yakalar: anon anahtarla sekiz view ve `students` tablosu sorgulanır, satır dönerse test kırılır. Canlı kimlik bilgisi yoksa atlanır — CI kırılmasın ama anahtar tanımlandığı anda korumaya başlasın. **Yeni bir view eklendiğinde testteki listeye de eklenmelidir**, aksi hâlde aynı açık sessizce geri gelir.

**050 — Hız sınırı (P1).** Giriş, kayıt, şifre sıfırlama ve davet kabulünde uygulama katmanında hiçbir savunma yoktu. Sayaç veritabanında tutulur; bellekte tutmak sunucusuz ortamda işe yaramazdı çünkü her örnek kendi sayacını sıfırdan başlatır. Sayma ve sınır kararı tek atomik adımda yapılır — "sor, sonra artır" iki eşzamanlı denemenin ikisinin de geçmesine izin verirdi. IP ve e-posta tabloya **ham gitmez**, SHA-256 özeti tutulur. Sayaç altyapısı bozulursa istek **engellenmez**, loglanır: kimsenin giriş yapamaması hız sınırının olmamasından kötü bir arızadır.

**Diğer sertleştirmeler.** Güvenlik başlıkları eklendi (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS; `poweredByHeader` kapatıldı). CSP **bilinçli olarak eklenmedi**: doğru CSP nonce ile middleware'de kurulur ve rapor modunda izlenmeden zorlayıcıya çevrilmemelidir. `next` sürümü hattın en güncel yamasına pinlendi (15.5.25) — pinlemenin amacı gözetimsiz sürüklenmeyi durdurmak, açık bir sürümde kalmak değil; `npm audit` 14 açıktan 2'ye indi. React tip paketleri çalışma zamanıyla aynı majora indirildi. `.env.example`'daki iki sahte sır silindi.

### Faz 2 — Mühendislik hijyeni

**ESLint kuruldu.** Bu katman hiç yoktu: config dosyası, script ve CI adımı bulunmuyordu; 80'den fazla bileşenlik bir kod tabanında `react-hooks/exhaustive-deps` ve `@next/next/*` kuralları hiç çalışmamıştı. Kural seçimi bilinçli olarak dar tutuldu — lint ilk açılırken sıkı kurallar yüzlerce uyarı üretir, uyarılar görmezden gelinir ve lint fiilen yine çalışmamış olur.

İlk koşu **gerçek bir bug** ortaya çıkardı: `homework-builder`'daki sepet memo'su `videoTasksByBookId`'yi kullanıyor ama bağımlılığa almamıştı; öğretmen bir kitabın video tercihini değiştirdiğinde sepet, seçim değişene kadar eski hatırlatmayı gösteriyordu. İki yanlış pozitif gerekçesiyle susturuldu (kitap yedeği bir dosya indirme ucudur, `next/link` indirmeyi bozar; sidebar'daki ref temizliği kasıtlı olarak canlı değeri okur).

**Sağlık kontrolü veritabanına bağlandı.** Önceden sabit `{status:'ok'}` dönüyordu — Supabase tamamen düşse bile yeşil kalıyordu. İlk yazılan yoklama da yanlıştı: kilitli bir tabloyu sorgulayıp izin hatasının kodunu tahmin etmeye dayanıyordu ve canlıda sağlıklı durumda "degraded" verdi. Doğrusu, sağlıklı durumda **hatasız** dönen bir sorgudur.

**Hata raporlama server action'lara ulaştı.** `reportError` yalnız iki hata sınırında çağrılıyordu; server action hataları kullanıcıya çevrilip dönüyor, iz hiçbir yere kaydolmuyordu. Raporlama üç çeviri fonksiyonuna kondu — uygulamanın tek hata boğaz noktası, 84 çağrı. Alternatif 19 ayrı dosyaya elle log eklemekti; biri unutulunca sessizce kör kalırdı.

**Segment hata sınırları** eklendi (teacher, student, parent, auth, invite). Sınır yalnız kökte ve `(dashboard)` düzeyindeydi; tek bir alt bileşen hatası tüm paneli düşürüyor, kullanıcı kenar çubuğunu bile kaybediyordu.

**CI beş adıma çıktı**: lint, typecheck, test, güvenlik taraması, derleme — artı ayrı bir uçtan uca işi. E2E bugüne kadar CI'da **hiç koşmamıştı**; `playwright.config.ts`'teki CI dalları ölü koddu. Node sürümü `.nvmrc` ve `engines` ile sabitlendi, Dependabot eklendi.

*Bilinçli ve geçici bir taviz:* `npm audit` eşiği `critical`. Bugün tek bir bilinen `high` açık var (postcss, next üzerinden) ve yalnız Next 16 majör yükseltmesiyle kapanıyor. Eşiği `high` bırakmak boru hattını ilk günden kalıcı kırmızıya çevirirdi — kalıcı kırmızı boru hattı da görmezden gelinir. **Next 16 yükseltmesinden sonra eşik `high`a çıkarılmalı.**

### Faz 3 — Çok kiracılığı tamamlama (051)

**Aktif çalışma alanı seçilebilir oldu.** Tüm okuma yolu `profiles.default_workspace_id` üzerinden geçiyordu ve bunu değiştirecek hiçbir arayüz yoktu. Dahası `accept_invitation` bu alanı yalnız **boşken** yazıyor: zaten bir kurumu olan bir öğretmen ikinci bir kuruma davet edildiğinde o kurumun verisini hiç göremiyor, **üstelik hata da almıyordu**. Sessiz başarısızlık, kullanıcının bildireceği türden bile değil.

Aktif workspace artık bir çerezde; `default_workspace_id` yalnız varsayılan. Çerez **kullanıcı tarafından değiştirilebilir** kabul edilir: içindeki değer bir yetki değil bir tercihtir ve her okumada üyelik doğrulanır (`resolveActiveWorkspaceId`, testli). Karar tek yerde verilir — middleware ile sunucu bileşenlerinin ayrı mantık kullanması bu kod tabanında zaten bir kez soruna yol açtı. Modül bilinçli olarak **saftır** ve `next/headers` içe aktarmaz; middleware Edge'de koşuyor. Seçici tek çalışma alanında hiç çizilmez.

**Askıya alma çalışır hâle geldi.** `workspaces.status` alanı 001'den beri `'suspended'` kabul ediyordu ama hiçbir yerde okunmuyordu — `getTeacherContext` workspace'i `select('id, name')` ile çekiyor, status sorguya bile girmiyordu. Kontrol `is_workspace_member` ve `has_workspace_role` içine kondu: **uygulama katmanına değil**, çünkü uygulama atlanabilir — PostgREST üzerinden doğrudan sorgu yapan bir istemci uygulamayı hiç görmez.

**`assistant` rolü kaldırıldı.** Şemada vardı ama fiilen kırıktı: middleware onu `/teacher` alanına alıyor, `getTeacherContext` reddedip `/login`'e atıyordu. `can_read_student` onu öğrenci verisine yetkili sayıyor ama hiçbir ekran ona açılmıyordu — bu ikilik ileride yanlış tarafa çözülebilirdi. Mevcut üyelikler silinmedi, `inactive` yapıldı.

**E-posta doğrulaması için akış hazırlandı.** Doğrulama açıldığında `signUp` oturum döndürmez, yani `create_teacher_workspace`'in `auth.uid()` kontrolü (024) başarısız olur ve workspace kurulamaz. Ad ve çalışma alanı adı artık kullanıcı üst verisine yazılıyor; kullanıcı e-postasını doğrulayıp ilk kez girdiğinde workspace **o anda** kuruluyor. Doğrulama kapalıyken davranış aynen korunur. Kayıt ekranına "e-postanızı doğrulayın" durumu eklendi.

*Davetlileri muaf tutma fikrinden vazgeçildi:* Supabase'in doğrulama ayarı proje geneli ve muafiyet, kullanıcıyı admin API ile önceden onaylı oluşturmayı — yani Faz 1'de sildiğimiz **servis anahtarını geri getirmeyi** gerektiriyordu. RLS'i tamamen atlayan bir anahtarı sunucu ortamına sokmak, davetliye bir ek adım kazandırmaya değmez.

**Denetim kaydı eklendi.** "Bu ödevi kim onayladı, bu daveti kim iptal etti?" sorularının cevabı yoktu; `created_by_profile_id` yalnız altı tabloda, `updated_by` hiçbirinde yoktu. Tek, **ekleme-only** bir olay tablosu: `UPDATE` ve `DELETE` politikası yok — değiştirilebilen bir denetim kaydı denetim kaydı değildir. Yalnız geri alınamaz eylemler kaydedilir (onay, iade, arşivleme, davet oluşturma/iptal); her tıklamayı yazmak tabloyu okunamaz ve pahalı yapardı. Yazma **asla patlamaz**: denetim satırı yazılamadı diye ödev onayı geri alınmamalı.

Ayrıca 002'deki yardımcı fonksiyonların `search_path` sabitlemesi tanımların kendisine yazıldı — 024 bunu toplu bir `ALTER` ile yapmıştı ama sıfırdan kurulan bir ortamda 002 yeniden uygulanırsa koruma sessizce kaybolurdu.

**R7 sonrası bekleme listesi:** reddedilen ödevde öğrenciye geri bildirim metni; öğrenci mobil ödev ekranının kompakt revizyonu; aynı kitapta ardışık çoklu hedefler (Hedef 2/3) için UI; toplu kitap içe aktarma. **R7-02 dışında bırakılanlar** (bilinçli): otomatik kaynak öneri motoru, %70 ilerleme eşiği, konu eşiği ile kaynak başlatma, kaynak zorluk puanları, zorunlu tam müfredat eşleştirmesi.
