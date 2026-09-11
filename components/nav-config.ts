import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Settings,
  LifeBuoy,
  UserPlus,
  FileBarChart,
  LayoutDashboard,
  Library,
  ListChecks,
  ShieldCheck,
  Waypoints,
  StickyNote,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import type { LinkTab } from '@/components/shared/link-tabs'

export type Role = 'teacher' | 'student' | 'parent'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Yalnızca tam eşleşmede aktif say (dashboard kökleri için). */
  exact?: boolean
}

/**
 * Katlanabilir menü grubu.
 *
 * NEDEN AYRI TİP: bir grubun kendi `href`'i yok — tıklanınca bir yere
 * gitmez, açılır. `NavItem`'a isteğe bağlı `children` eklemek, her
 * tüketicinin "bu bir bağlantı mı yoksa grup mu" kontrolü yapmasını
 * gerektirirdi ve `href` alanı gruplarda anlamsız bir zorunluluk olarak
 * kalırdı.
 */
export interface NavGroup {
  /** Grup kimliği — açık/kapalı durumu bununla saklanır. */
  id: string
  label: string
  icon: LucideIcon
  items: NavItem[]
}

export type NavEntry = NavItem | NavGroup

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry
}

/**
 * Öğrenci ekranları — TEK KAYNAK.
 *
 * Aynı beş ekran menüde iki yerde görünüyor:
 *  1) Bir öğrenci açıkken, o öğrencinin altında (studentContextNav),
 *  2) Ana menüde "Öğrenci İşleri" grubunun altında
 *     (studentScreenLinks) — bağlantı öğrenci listesine gider, seçim
 *     yapılınca doğrudan istenen ekrana girilir.
 *
 * `slug` URL'de taşınan kimlik (?ekran=...), `path` öğrenci altındaki
 * gerçek yol. İkisi ayrı tutuluyor: "homework/new" gibi bir yol sorgu
 * değerinde okunaksız kalırdı.
 */
export const studentScreens = [
  // SIRA R7/03'ÜN HEDEF MENÜSÜNE GÖRE. Doküman menüyü öğretmenin
  // sorularına göre diziyor: "bu hafta nasıl gidiyor" → "ne vereceğim"
  // → "hangi kaynaktan" → "hangi konudayız" → "ne zaman görüşüyoruz".
  //
  // Haftalık Akış (R7/05): "öğrenci bu haftayı nasıl götürüyor?"
  // Ödev Planlama'dan AYRI bir ekran — biri yük yerleştirir, diğeri
  // yerleşen yükü yönetir.
  { slug: 'haftalik-akis', path: 'haftalik-akis', label: 'Haftalık Akış', icon: Waypoints },
  // R7/05 kabul #1: ekranın adı ve GÖREVİ ayrıştırıldı.
  //
  // Bu ekran haftayı hiç takip etmiyordu; kitap haritasından çalışma
  // seçip yayınlıyordu — yani "ne veriyorum?" sorusunu çözüyordu.
  // "Haftalık Plan" adı, yapmadığı işi yapıyormuş gibi gösteriyor ve
  // asıl haftalık takibin zaten var olduğu izlenimi veriyordu. Yol
  // (homework/new) DEĞİŞMEDİ: kayıtlı bağlantıları kırmanın bir
  // karşılığı yok, sorun adlandırmaydı.
  { slug: 'odev-planlama', path: 'homework/new', label: 'Ödev Planlama', icon: ListChecks },
  { slug: 'kaynak', path: 'goals', label: 'Kaynak Planı', icon: Library },
  // R7/03: "Müfredat Akışı" → "Akademik Akış". Ekran artık yalnız
  // müfredatı değil konu sırası + zaman + GERÇEK akademik ilerlemeyi
  // yönetiyor; eski ad yaptığı işin yalnız üçte birini söylüyordu.
  // Yol (curriculum) DEĞİŞMEDİ.
  { slug: 'mufredat', path: 'curriculum', label: 'Akademik Akış', icon: CalendarRange },
  // Ders & Görüşmeler (R7-04).
  { slug: 'gorusmeler', path: 'gorusmeler', label: 'Görüşmeler', icon: CalendarCheck },
  { slug: 'koruma', path: 'protection', label: 'Koruma Havuzu', icon: ShieldCheck },
  { slug: 'rapor', path: 'report', label: 'Rapor', icon: FileBarChart },
] as const

export type StudentScreen = (typeof studentScreens)[number]

/** ?ekran= değerini doğrular; tanınmayan değer için null döner. */
export function studentScreenBySlug(slug: string | undefined): StudentScreen | null {
  if (!slug) return null
  return studentScreens.find((s) => s.slug === slug) ?? null
}

/**
 * Ekranların öğrenci SEÇİLMEMİŞKEN görünen hâli — "Öğrenci İşleri"
 * grubunun içinde duruyor. Hedef öğrenci listesidir: liste sayfası
 * ?ekran= değerini okur ve satır bağlantılarını doğrudan o ekrana
 * yöneltir.
 */
export const studentScreenLinks: NavItem[] = studentScreens.map((s) => ({
  href: `/teacher/students?ekran=${s.slug}`,
  label: s.label,
  icon: s.icon,
}))

export const teacherNav: NavEntry[] = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  // ÖĞRENCİ İŞLERİ: öğrenciyle ilgili her ekran tek başlık altında —
  // liste, yeni kayıt, görevler ve öğrenciye özel beş ekran.
  //
  // Kitap Havuzu ve Müfredat Şablonları BİLİNÇLİ OLARAK DIŞARIDA:
  // adları öğrenci ekranlarındakilere benzese de bunlar çalışma alanı
  // seviyesi — bir kez kurulur, bütün öğrenciler için geçerlidir.
  // Gruba almak, "öğrenciye kitap atama" ile "havuza kitap ekleme"yi
  // aynı iş gibi gösterirdi.
  {
    id: 'ogrenci-isleri',
    label: 'Öğrenci İşleri',
    icon: Users,
    items: [
      { href: '/teacher/students', label: 'Öğrenciler', icon: Users, exact: true },
      { href: '/teacher/students/new', label: 'Yeni Öğrenci', icon: UserPlus },
      { href: '/teacher/tasks', label: 'Görevler', icon: ClipboardList },
      ...studentScreenLinks,
    ],
  },
  { href: '/teacher/books', label: 'Kitaplar', icon: BookOpen },
  { href: '/teacher/curriculum', label: 'Müfredat', icon: CalendarRange },
  // EĞİTİM DÖNEMİ / PLAN / DESTEK ARTIK DÜZ SEVİYEDE.
  //
  // Önce "Yönetim" adlı katlanabilir bir grubun altındaydılar. Grup,
  // seyrek kullanılan ekranları toplamak için kurulmuştu ama ters
  // çalıştı: üçü de menüde hiç görünmüyordu, kullanıcı önce
  // "Yönetim"in ne içerdiğini tahmin edip açmak zorundaydı. Üç öğe
  // için bir tıklama ve bir tahmin, kazandırdığı derli topluluktan
  // pahalı.
  // FİNANS her öğretmene GÖRÜNÜR ama yalnız sahibe açıktır (066).
  // Menüyü role göre budamak, Plan bağlantısında olduğu gibi yetkinin
  // ikinci bir kaynağını yaratırdı; sayfanın kendisi neden
  // giremediğini zaten açıklıyor.
  { href: '/teacher/finans', label: 'Finans', icon: Wallet },
  { href: '/teacher/terms', label: 'Eğitim Dönemi', icon: CalendarDays },
  { href: '/teacher/destek', label: 'Destek', icon: LifeBuoy },
  // AYARLAR TEK GİRDİ (072).
  //
  // "Plan" ve "Hesap ve Veri" menüde ayrı ayrı duruyordu, /teacher/ayarlar
  // kökünün ise sayfası bile yoktu. Hesabıyla ilgili bir şey arayan
  // kullanıcı için ortak bir adres yoktu; ad ve şifre değiştirmenin
  // adresi ise hiç yoktu. İkisi de artık ayarlar sayfasının içinde.
  //
  // Menü role göre budanmıyor — Plan ve Finans ile aynı gerekçe: sayfanın
  // kendisi neye erişilebileceğini zaten söylüyor.
  { href: '/teacher/ayarlar', label: 'Ayarlar', icon: Settings },
]

/**
 * Genel Bakış sayfasının İÇİNDEKİ sekmeler — artık üst şeritte (068).
 *
 * Bunlar `studentScreens` gibi ayrı rota DEĞİL: hepsi aynı sayfanın
 * (`/teacher/students/<id>`) farklı panelleri ve verileri o sayfanın tek
 * sorgu dalgasından geliyor. Bu yüzden yol yerine SORGU PARAMETRESİ ile
 * taşınıyorlar (`?sekme=kitaplar`).
 *
 * NEDEN URL'DE: eskiden components/ui/tabs ile client state'te
 * tutuluyorlardı — hangi sekmede olduğun paylaşılamıyor, yer imlenemiyor
 * ve geri tuşuyla gezilemiyordu. Bir ödevi konuşurken "Ödevler sekmesine
 * gel" demek, karşı tarafa tıklama tarifi vermek demekti.
 */
/*
 * R7/03 AD DEĞİŞİKLİKLERİ. Bu etiketler sayfa başlığı olarak da
 * basılıyor (page.tsx: `title={tab.label}`), bu yüzden şeritteki adla
 * aynı olmak zorundalar — yoksa "Öğretmen Hafızası"na tıklayan
 * kullanıcı "Akademik Not" başlıklı bir sayfa görürdü. Slug'lar
 * DEĞİŞMEDİ: kayıtlı `?sekme=` bağlantıları çalışmaya devam eder.
 */
export const studentOverviewTabs = [
  { slug: 'kitaplar', label: 'Kitaplar', icon: BookOpen },
  { slug: 'odevler', label: 'Yayınlanan Ödevler', icon: ClipboardList },
  // 'durum' BURADAN KALKTI (R7/03 + R7/05 §8): Durum Bildirimleri artık
  // Haftalık Akış'ın bir alt sekmesi. Bildirim haftanın ritmine bağlı
  // üretiliyor (079); bağlı olduğu şeyden ayrı bir sekmede durması
  // kavramı da koparıyordu. Eski `?sekme=durum` bağlantıları sayfada
  // yeni adrese YÖNLENDİRİLİYOR — kırılmıyorlar.
  { slug: 'veliler', label: 'Veliler', icon: Users },
  // Ad, alanın kime ait olduğunu söylemeli: burası öğrencinin notu
  // değil, öğretmenin kendine tuttuğu kayıt.
  { slug: 'not', label: 'Öğretmen Hafızası', icon: StickyNote },
] as const

export type StudentOverviewTab = (typeof studentOverviewTabs)[number]

/** `?sekme=` değerini doğrular; tanınmayan değer için null (= özet). */
export function studentOverviewTabBySlug(
  slug: string | undefined
): StudentOverviewTab | null {
  if (!slug) return null
  return studentOverviewTabs.find((t) => t.slug === slug) ?? null
}

/**
 * Öğrenci çalışma masasının SEKMELERİ (067, R7/03 ile yeniden gruplandı).
 *
 * Bu ekranlar öğrenciye özeldir — hepsi URL'de bir öğrenci id'si taşır. Bu
 * yüzden sabit bir dizi değil, id alan bir ÜRETİCİ. Üstteki sekme
 * şeridinde render ediliyor (student-tabs.tsx); sol menüde yalnız
 * "Genel Bakış"a dönüş yolu var (studentOverviewNav).
 *
 * ============================================================
 * NEDEN DÜZ LİSTE DEĞİL — R7 / Site Testi 03
 * ============================================================
 * Şerit on üç bağlantıyı aynı seviyede gösteriyordu ve bazıları farklı
 * adlarla AYNI veri ailesine hizmet ediyordu: Kitaplar ile Kaynak Planı
 * aynı kaynak setinin iki derinliği, Ödevler ile Ödev Planlama aynı
 * ödev sürecinin iki parçası. Öğretmen "ödev vereceğim" derken hangi
 * sekmeye gideceğini düşünmek zorundaydı.
 *
 * Artık aile başlığı tıklanabilir: "Kaynaklar" doğrudan Kitaplar'ı açar,
 * yanındaki ok alt görünümü verir. Doküman bunu açıkça şart koşuyor —
 * "İki büyük karttan oluşan zorunlu bir ara açılış ekranı
 * yapılmamalıdır." Bu yüzden grup başlığının kendi `href`'i var; tıklama
 * bir seçim ekranına değil, işin yapıldığı yere gider.
 *
 * "Diğer" bunun istisnası: kendi hedefi YOK, çünkü altındaki üç ekranın
 * hiçbiri "varsayılan" değil — seyrek kullanılan yönetim alanları.
 *
 * ROTALARIN HİÇBİRİ DEĞİŞMEDİ. Doküman: "mevcut ekranların veri ve
 * işlevleri silinmez; öncelik, rota ve menü hiyerarşisini düzeltmektir."
 * Kayıtlı bağlantılar ve tarayıcı geçmişi çalışmaya devam eder.
 */
export function studentTabs(studentId: string): LinkTab[] {
  const base = `/teacher/students/${studentId}`
  const screen = (path: string) => `${base}/${path}`
  const panel = (slug: string) => `${base}?sekme=${slug}`

  return [
    { key: 'genel', label: 'Genel Bakış', href: base },
    { key: 'haftalik-akis', label: 'Haftalık Akış', href: screen('haftalik-akis') },
    {
      key: 'odevler',
      label: 'Ödevler',
      href: panel('odevler'),
      items: [
        { key: 'yayinlanan-odevler', label: 'Yayınlanan Ödevler', href: panel('odevler') },
        { key: 'odev-planlama', label: 'Ödev Planlama', href: screen('homework/new') },
      ],
    },
    {
      key: 'kaynaklar',
      label: 'Kaynaklar',
      href: panel('kitaplar'),
      items: [
        { key: 'kitaplar', label: 'Kitaplar', href: panel('kitaplar') },
        { key: 'kaynak-plani', label: 'Kaynak Planı', href: screen('goals') },
      ],
    },
    { key: 'akademik-akis', label: 'Akademik Akış', href: screen('curriculum') },
    { key: 'gorusmeler', label: 'Görüşmeler', href: screen('gorusmeler') },
    { key: 'koruma', label: 'Koruma Havuzu', href: screen('protection') },
    { key: 'rapor', label: 'Rapor', href: screen('report') },
    {
      key: 'diger',
      label: 'Diğer',
      items: [
        { key: 'veliler', label: 'Veliler', href: panel('veliler') },
        // R7/03: "Akademik Not" → "Öğretmen Hafızası". Ad, alanın kime
        // ait olduğunu söylemeliydi: burası öğrencinin notu değil,
        // öğretmenin kendine tuttuğu kayıt.
        { key: 'ogretmen-hafizasi', label: 'Öğretmen Hafızası', href: panel('not') },
        { key: 'ogrenci-ayarlari', label: 'Öğrenci Ayarları', href: screen('edit') },
      ],
    },
  ]
}

/**
 * Adres çubuğundaki konumdan aktif ÜST sekmeyi bulur.
 *
 * Saf fonksiyon ve burada duruyor ki test edilebilsin: kural iki farklı
 * mantık içeriyor ve ikisi de sessizce bozulabilir.
 *
 *  1) Genel Bakış rotasındayken sekmeyi belirleyen şey YOL DEĞİL sorgu
 *     parametresi — beş panelin de yolu aynı.
 *  2) Alt rotalarda sorgu hiç rol oynamaz ve EN UZUN eşleşen yol
 *     kazanır. "Genel Bakış" her alt rotanın öneki olduğu için basit bir
 *     startsWith'te hep aktif çıkardı.
 *
 * Bir grubun ALTINDAKİ bağlantı eşleşirse grubun kendi anahtarı döner:
 * Ödev Planlama'dayken şeritte "Ödevler" işaretli olmalı.
 */
export function activeStudentTab(
  tabs: LinkTab[],
  pathname: string,
  sekme: string | null,
  base: string
): string {
  if (pathname === base) {
    const target = sekme ? `${base}?sekme=${sekme}` : base
    for (const tab of tabs) {
      if (tab.href === target) return tab.key
      if (tab.items?.some((i) => i.href === target)) return tab.key
    }
    // Tanınmayan bir ?sekme= değeri: sayfa özeti gösteriyor, şerit de
    // Genel Bakış'ı işaretlemeli — hiçbiri işaretli olmayan bir şerit
    // "buraya nasıl geldim" sorusunu doğurur.
    return 'genel'
  }

  let bestKey = ''
  let bestLength = 0
  const consider = (href: string | undefined, key: string) => {
    // Sorgulu hedefler yalnız Genel Bakış rotasında anlamlı; base'in
    // kendisi de her alt rotanın öneki olduğu için burada elenir.
    if (!href || href.includes('?') || href === base) return
    if (pathname !== href && !pathname.startsWith(`${href}/`)) return
    if (href.length <= bestLength) return
    bestLength = href.length
    bestKey = key
  }
  for (const tab of tabs) {
    consider(tab.href, tab.key)
    for (const item of tab.items ?? []) consider(item.href, tab.key)
  }
  return bestKey
}

/**
 * Sol menüdeki öğrenci bloğu — TEK bağlantı.
 *
 * Beş ekran yukarıdaki sekme şeridine taşındıktan sonra sidebar'ın işi
 * yalnız çalışma masasının köküne dönüş yolu bırakmak. Ayrı bir fonksiyon
 * olarak duruyor ki sidebar `studentContextNav(...)[0]` gibi sıraya bağımlı
 * bir dilim almasın: sekme sırası değiştiğinde menü sessizce bozulurdu.
 */
export function studentOverviewNav(studentId: string): NavItem[] {
  return [
    {
      href: `/teacher/students/${studentId}`,
      label: 'Genel Bakış',
      icon: LayoutDashboard,
      exact: true,
    },
  ]
}

/**
 * Platform yönetimi sekmeleri.
 *
 * BURADA, app/admin/layout.tsx'te DEĞİL (067): dizi orada satır içinde
 * duruyordu, yani menü tanımının tek kaynak olması kuralının dışında
 * kalan tek yerdi. Rol menüleriyle aynı tipi kullanır ki sekme şeridi
 * aktif olanı `exact` kuralına göre işaretleyebilsin — /admin her
 * yönetim adresinin öneki olduğundan onsuz hep aktif görünürdü.
 */
export const adminNav: NavItem[] = [
  { href: '/admin', label: 'Özet', icon: LayoutDashboard, exact: true },
  { href: '/admin/talepler', label: 'Destek Talepleri', icon: LifeBuoy },
  { href: '/admin/kutuphane', label: 'Kütüphane', icon: Library },
  { href: '/admin/partnerler', label: 'Partnerler', icon: Users },
]

export const studentNav: NavItem[] = [
  { href: '/student', label: 'Ödevlerim', icon: ClipboardList, exact: true },
  // R8: öğrenci artık kendi akademik planını da görebiliyor. Kitap haritası
  // menüye alınmadı — kitaba ödev kartından girilir, bağlam orada.
  { href: '/student/curriculum', label: 'Akışım', icon: CalendarRange },
  { href: '/student/review', label: 'Tekrar', icon: ShieldCheck },
]

// Veli panelinde tek ekran var; gezinme listesi bilinçli olarak boş.
export const parentNav: NavItem[] = []

/**
 * Rol -> nav eşlemesi. AppSidebar bunu KENDİSİ çözer; nav dizisi Server
 * Component'ten prop olarak geçirilemez, çünkü `icon` bir bileşen
 * fonksiyonudur ve fonksiyonlar RSC sınırından geçemez.
 */
export const navByRole: Record<Role, NavEntry[]> = {
  teacher: teacherNav,
  student: studentNav,
  parent: parentNav,
}
