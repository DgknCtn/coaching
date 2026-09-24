import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ANON'A AÇILAN FONKSİYONLAR — KAPIYI AÇIK UNUTMA BEKÇİSİ (109)
//
// ============================================================
// NEDEN BU TEST VAR
//
// 109, anon'un çağırabildiği 155 fonksiyonu kapattı. Ama o migration
// bir KERELİK bir düzeltme: bundan sonra yazılacak her yeni fonksiyon,
// PostgreSQL'in varsayılanı gereği yine PUBLIC'e açık doğar.
//
// `ALTER DEFAULT PRIVILEGES` bunu büyük ölçüde kapatıyor ama tam
// garanti vermiyor: varsayılan yetkiler OLUŞTURAN ROLE bağlı, panelden
// başka bir rolle açılan fonksiyon kaçar.
//
// Asıl kaçak yolu ise daha basit: bir geliştiricinin mevcut bir
// migration'dan `GRANT EXECUTE ... TO anon, authenticated` satırını
// kopyalaması. O satır sessizce çalışır, hiçbir ekran bozulmaz ve
// yüzey yeniden açılır.
//
// Bu test kimlik bilgisi GEREKTİRMEZ ve her koşuda çalışır — canlıya
// bağlı testlerin aksine CI'da asla atlanmaz.
//
// NE TEST ETMEZ: canlının migration'larla aynı olduğunu. O,
// docs/production-readiness/baseline.md'deki salt okunur denetimin işi.
// ============================================================

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')

/** 109'dan SONRAKİ dosyalar denetlenir: öncekiler zaten 109 ile kapandı. */
const FIRST_ENFORCED = 110

/**
 * Anon'a EXECUTE verilmesi meşru olan fonksiyonlar.
 *
 * İki kategori var ve ikisi de 109'un başlığında gerekçeli:
 *
 *   1. OTURUMSUZ AKIŞLAR — çağrıldıklarında henüz oturum yoktur.
 *   2. RLS POLİTİKALARININ ÇAĞIRDIKLARI — politika ifadesi, sorguyu
 *      yapan rolün bağlamında değerlendirilir; anon çağıramazsa RLS
 *      satırı süzemez ve sorgu 42501 ile patlar (108'in konusu).
 *
 * İkinci kategori 109'da `pg_policies` üzerinden TÜRETİLİYOR; burada
 * elle yazılı olmasının sebebi, bu testin veritabanına bağlanmaması.
 * Yeni bir politika yardımcısı eklenirse bu listeye de eklenmeli —
 * testin verdiği hata mesajı bunu söylüyor.
 */
const ANON_IZINLI = [
  // 1) Oturumsuz akışlar
  'check_rate_limit', // lib/rate-limit.ts:91 — giriş/kayıt öncesi
  'get_invitation_by_token', // app/invite/[token]/page.tsx:37 — oturumsuz sayfa
  'log_auth_event', // lib/auth-audit.ts:73 — başarısız girişte de yazar
  // 2) RLS politikalarından çağrılanlar
  'can_read_library',
  'can_read_student',
  'current_partner_id',
  'current_profile_id',
  'is_library_workspace',
  'is_parent_of_student',
  'is_student_self',
  'is_workspace_member',
  'my_member_workspace_ids',
  'my_workspace_ids',
  'student_workspace_matches',
] as const

function enforcedMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .filter(f => {
      const n = Number.parseInt(f.slice(0, 3), 10)
      return Number.isFinite(n) && n >= FIRST_ENFORCED
    })
    .sort()
    .map(name => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8'),
    }))
}

/** Yorum satırları atılır — örnek SQL ve ROLLBACK blokları yorumda yaşıyor. */
function withoutComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
}

describe('fonksiyon yetkileri · anon yüzeyi kapalı kalır', () => {
  it('izin listesi iki kategoriyi de kapsıyor', () => {
    // Liste kazara boşalırsa ya da kısalırsa test bunu söylemeli;
    // aksi hâlde "ihlal yok" sonucu anlamsız olur.
    expect(ANON_IZINLI.length).toBeGreaterThanOrEqual(14)
  })

  it.each(enforcedMigrations().map(f => f.name))(
    '%s · izin listesi dışında anon GRANT yok',
    name => {
      const sql = withoutComments(
        enforcedMigrations().find(f => f.name === name)!.sql
      )

      // `TO anon`, `TO anon, authenticated`, `TO authenticated, anon` —
      // hepsi yakalanır.
      const grants = [
        ...sql.matchAll(
          /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)\s*TO\s+([^;]+);/gi
        ),
      ]

      const ihlaller = grants
        .filter(m => /\banon\b/i.test(m[2]))
        .map(m => m[1])
        .filter(fn => !ANON_IZINLI.includes(fn as (typeof ANON_IZINLI)[number]))

      expect(
        ihlaller,
        `${name}: anon'a açılan fonksiyon izin listesinde değil -> ${ihlaller.join(', ')}. ` +
          'Gerçekten oturumsuz bir akış ya da bir RLS politikası mı çağırıyor? ' +
          'Öyleyse tests/function-grants.test.ts içindeki ANON_IZINLI listesine ' +
          'gerekçesiyle ekleyin; değilse GRANT satırını kaldırın.'
      ).toEqual([])
    }
  )

  it('toplu REVOKE geri alınmamış', () => {
    // `GRANT EXECUTE ON ALL FUNCTIONS ... TO anon` tek satırda 109'un
    // tamamını geri alır ve yukarıdaki fonksiyon-adı taraması bunu
    // göremez.
    const ihlaller: string[] = []

    for (const { name, sql } of enforcedMigrations()) {
      const code = withoutComments(sql)
      if (/GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS[^;]*\banon\b/i.test(code)) {
        ihlaller.push(name)
      }
      if (/ALTER\s+DEFAULT\s+PRIVILEGES[^;]*GRANT\s+EXECUTE[^;]*\banon\b/i.test(code)) {
        ihlaller.push(`${name} (varsayılan yetkiler)`)
      }
    }

    expect(
      ihlaller,
      `Toplu anon EXECUTE geri verilmiş: ${ihlaller.join(', ')}`
    ).toEqual([])
  })
})
