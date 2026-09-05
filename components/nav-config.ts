import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  CreditCard,
  LifeBuoy,
  UserPlus,
  FileBarChart,
  LayoutDashboard,
  Library,
  ListChecks,
  MessageSquareDashed,
  ShieldCheck,
  StickyNote,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

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
  { slug: 'mufredat', path: 'curriculum', label: 'Müfredat Akışı', icon: CalendarRange },
  { slug: 'kaynak', path: 'goals', label: 'Kaynak Planı', icon: Library },
  { slug: 'haftalik', path: 'homework/new', label: 'Haftalık Plan', icon: ListChecks },
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
  // Plan yalnız SAHİBE anlamlı ama menüde herkese görünür: öğretmen
  // tıkladığında sayfa zaten yetki hatası verir. Menüyü role göre
  // budamak, ikinci bir yetki kaynağı yaratmak olurdu.
  { href: '/teacher/ayarlar/abonelik', label: 'Plan', icon: CreditCard },
  { href: '/teacher/destek', label: 'Destek', icon: LifeBuoy },
  // HESAP VE VERİ (068): silme talebi altyapısı 053'ten beri vardı ama
  // hiçbir yerden erişilemiyordu. Menüde herkese görünür, Plan ve Finans
  // ile aynı gerekçeyle: menüyü role göre budamak yetkinin ikinci bir
  // kaynağını yaratırdı, sayfa neden giremediğini zaten açıklıyor.
  { href: '/teacher/ayarlar/veri', label: 'Hesap ve Veri', icon: ShieldCheck },
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
export const studentOverviewTabs = [
  { slug: 'kitaplar', label: 'Kitaplar', icon: BookOpen },
  { slug: 'odevler', label: 'Ödevler', icon: ClipboardList },
  { slug: 'durum', label: 'Durum', icon: MessageSquareDashed },
  { slug: 'veliler', label: 'Veliler', icon: Users },
  { slug: 'not', label: 'Akademik Not', icon: StickyNote },
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
 * Öğrenci çalışma masasının SEKMELERİ (067).
 *
 * Bu ekranlar öğrenciye özeldir — hepsi URL'de bir öğrenci id'si taşır. Bu
 * yüzden sabit bir dizi değil, id alan bir ÜRETİCİ.
 *
 * ARTIK SOL MENÜDE DEĞİL, ÜSTTEKİ SEKME ŞERİDİNDE render ediliyor
 * (app/(dashboard)/teacher/students/[studentId]/student-tabs.tsx). Sol
 * menüde de aynı beşini listelemek, ekranda aynı bağlantıyı iki kez
 * göstermek olurdu; sidebar artık yalnız "Genel Bakış"a bir dönüş yolu
 * bırakıyor (studentOverviewNav).
 *
 * "Genel Bakış" exact işaretlidir; olmasaydı alt rotalarda (ör. /goals) hem
 * kendisi hem Genel Bakış aktif görünürdü.
 */
export function studentContextNav(studentId: string): NavItem[] {
  const base = `/teacher/students/${studentId}`
  return [
    { href: base, label: 'Genel Bakış', icon: LayoutDashboard, exact: true },
    // Genel Bakış'ın panelleri hemen onun ardından: ikisi de aynı
    // sayfanın parçası, aradaki sınır kullanıcı için yok.
    ...studentOverviewTabs.map((t) => ({
      href: `${base}?sekme=${t.slug}`,
      label: t.label,
      icon: t.icon,
    })),
    ...studentScreens.map((s) => ({
      href: `${base}/${s.path}`,
      label: s.label,
      icon: s.icon,
    })),
  ]
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
