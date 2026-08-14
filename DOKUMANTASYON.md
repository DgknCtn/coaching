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
- **books → book_sections → book_tests**: Bir kitap ünitelere, üniteler tekil testlere ayrılır. İlerleme takibinin en küçük birimi bir "test"tir.
- **student_book_assignments**: Bir kitabı bir öğrenciye, bir döneme bağlar (başlangıç/hedef bitiş tarihiyle).
- **homework_batches / homework_items**: Öğretmen bir "ödev paketi" oluşturur (son teslim tarihli), içine birden çok test koyar. Öğrenci her testi tek tek tamamlar.
- **test_completions**: Bir testin tamamlanmasının kalıcı kaydı. `source` alanı ödevden mi manuel mi geldiğini tutar. Kısmi benzersiz indeks sayesinde bir (atama, test) çiftinin yalnızca **tek bir aktif tamamlaması** olabilir; geri alma (`reverted`) desteklenir.

### Sınav türleri
Öğrenci ve kitaplar `TYT / AYT / LGS / KPSS / DGS / Other` sınav türleriyle etiketlenir.

---

## 4. Özellikler (Ekran Ekran)

### Öğretmen Paneli
- **Dashboard** — Tüm öğrencilerin genel bakış tablosu, risk durumu göstergesiyle.
- **Eğitim dönemleri (Terms)** — Dönem oluşturma/yönetme (taslak / aktif / tamamlandı / arşiv).
- **Kitap havuzu** — Kitap listesi ve tek işlemde ünite + test yapısıyla kitap oluşturma (`create_book_with_sections_and_tests` RPC).
- **Kitap detay** — Kitabın ünite/test ağacı.
- **Öğrenci listesi** — Risk durumu rozetleriyle öğrenciler.
- **Öğrenci oluşturma / detay** — Sekmeli görünüm: Kitaplar / Ödevler / Veliler.
- **Kitap atama** — Öğrenciye dönem bazlı kitap atama dialoğu.
- **Ödev oluşturma (HomeworkBuilder)** — Atanmış kitaplardan testleri seçip son teslim tarihli ödev paketi kurma.
- **Davet oluşturma** — Öğrenci veya veli için tek kullanımlık, süreli, e-postaya bağlı davet linki.
- **Öğrenci ilerleme raporu** — `/teacher/students/[id]/report`, mevcut görünümlerden üretilen yazdırılabilir/PDF rapor.

### Öğrenci Paneli
- Kişisel ödev listesi; her test için **"Tamamladım / Geri Al"** aksiyonu.
- Atanmış kitaplarda ilerleme görünümü.

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
- **Row Level Security (RLS)** her tabloda; veri izolasyonu `workspace_id` üzerinden.
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
supabase/migrations/ 001–010
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

MVP ve MVP sonrası kalite fazları (P1–P4) **tamamlandı**: kimlik doğrulama, üç rolün panelleri, kitap/ödev/test takibi, davet akışı, ilerleme raporu, testler ve CI kuruludur. 10 veritabanı migration'ı çalıştırılmıştır (001–010).
