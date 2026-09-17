import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  compareHomeworkItems,
  counterLabel,
  sortHomeworkItems,
  splitByFlowOwnership,
  type HomeworkTestState,
} from '@/lib/homework-status'
import { deliverySilence, dueLabel, isLateAdded } from '@/lib/weekly-flow'
import { describeAssignEligibility } from '@/lib/bulk-actions'

// ============================================================
// R7 · ACİL REVİZE PAKETİ 02 (17.09.2026) — KABUL PAKETİ
//
// Maddeler canlı "Doğa" senaryosundan üretildi. Bu dosya her maddeyi
// KENDİ NUMARASIYLA kilitler, çünkü paketin amacı yeni özellik değil:
// mevcut çalışma döngüsünün güvenilir hale gelmesi. Böyle bir işin en
// büyük riski, düzeltilen davranışın bir sonraki turda sessizce geri
// gelmesidir.
//
// Testler saf fonksiyonlara ve migration metnine bakıyor; kararların
// tamamı bilinçli olarak lib/ ve SQL içinde tutuldu ki buradan
// doğrulanabilsinler.
// ============================================================

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/097_active_load_and_student_week.sql'),
  'utf8'
)

/**
 * Migration'ın bir fonksiyon gövdesini ayıklar — YORUMLAR ATILIR.
 *
 * Yorum atmak şart: bu dosya bir kuralın SQL'de olmadığını da
 * doğruluyor (ör. "'completed' bu süzgeçte geçmemeli") ve gerekçeyi
 * anlatan yorum satırı o denetimi yanlış yere düşürürdü.
 * tests/migration-idempotency.test.ts aynı yöntemi kullanıyor.
 */
function sqlBetween(from: string, to: string): string {
  const start = MIGRATION.indexOf(from)
  expect(start, `${from} bulunamadı`).toBeGreaterThan(-1)
  const end = MIGRATION.indexOf(to, start)
  expect(end, `${to} bulunamadı`).toBeGreaterThan(start)
  return MIGRATION.slice(start, end)
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
}

// ============================================================
// R7-06.01 · Aktif Yükten Çıkar
// ============================================================

describe('R7-06.01 · aktif yükten çıkarma', () => {
  // Mekanizma bilinçli olarak VAR OLAN durumları kullanıyor: batch
  // 'archived', kalemler 'cancelled'. Okuma tarafının tamamı
  // 'cancelled'ı zaten süzüyor, bu yüzden sayaçlardan düşme ve Kitap
  // Haritasında "Henüz verilmedi"ye dönüş ek kod istemiyor.
  const release = () =>
    sqlBetween('CREATE OR REPLACE FUNCTION public.release_batch_from_active_load', '$fn$;')

  it('yapılmamış ve onay bekleyen kalemler serbestleşir', () => {
    expect(release()).toContain("hi.status IN ('pending', 'pending_approval')")
  })

  it('TAMAMLANMIŞ kalem korunur — kısmi ödevin onaylanan kısmı kalır', () => {
    // Kabul kriteri 4: "1/2 kısmi ödevde onaylanan 1 çalışma korunur".
    // Süzgeç 'completed' içermemeli; içerseydi öğrencinin bitirdiği iş
    // silinirdi.
    expect(release()).not.toContain("'completed'")
  })

  it('geçmiş kayıt silinmez — batch arşivlenir, DELETE yok', () => {
    expect(release()).toContain("SET status = 'archived'")
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.homework/i)
  })

  it('akademik kayıt (test_completions) çıkarmadan etkilenmez', () => {
    expect(release()).not.toContain('test_completions')
  })

  it('yeniden aktifleştirme ESKİ teslim tarihini diriltmez', () => {
    // Belge: "aktif/gelecek Haftalık Akış seçilerek yeni akışın son
    // teslimini miras almalı". due_date hedef akışın due_at'ından
    // yazılır — eski değer geri gelmez.
    const restore = sqlBetween(
      'CREATE OR REPLACE FUNCTION public.restore_batch_to_active_load',
      '$fn$;'
    )
    expect(restore).toContain("v_flow.due_at AT TIME ZONE 'Europe/Istanbul'")
    expect(restore).toContain('weekly_flow_id = p_weekly_flow_id')
  })

  it('kapanmış akışa ödev taşınamaz', () => {
    const restore = sqlBetween(
      'CREATE OR REPLACE FUNCTION public.restore_batch_to_active_load',
      '$fn$;'
    )
    expect(restore).toContain("v_flow.status <> 'active'")
  })
})

// ============================================================
// R7-06.02 · Güncel hafta en üstte / geçmiş borç ayrı
// ============================================================

describe('R7-06.02 · güncel hafta ve geçmiş borç ayrımı', () => {
  const batch = (id: string, flowId: string | null, status = 'active') => ({
    id,
    weekly_flow_id: flowId,
    status,
  })

  it('aktif akışa bağlı ödev güncel haftaya, diğerleri geçmiş borca düşer', () => {
    const split = splitByFlowOwnership(
      [batch('mini', 'flow-1'), batch('eski-1', 'flow-0'), batch('eski-2', null)],
      'flow-1'
    )
    expect(split.currentWeek.map(b => b.id)).toEqual(['mini'])
    expect(split.pastDebt.map(b => b.id)).toEqual(['eski-1', 'eski-2'])
  })

  it('aktif yükten çıkarılmış ödev HİÇBİR borç kovasına girmez', () => {
    // R7-06.01 ile bağ: çıkarmanın amacı tam olarak buydu. Geçmiş borç
    // olarak sayılsaydı işlem hiçbir şey değiştirmemiş olurdu.
    const split = splitByFlowOwnership(
      [batch('cikarilan', 'flow-0', 'archived'), batch('mini', 'flow-1')],
      'flow-1'
    )
    expect(split.released.map(b => b.id)).toEqual(['cikarilan'])
    expect(split.pastDebt).toEqual([])
    expect(split.currentWeek.map(b => b.id)).toEqual(['mini'])
  })

  it('aktif akış yokken hiçbir ödev "bu hafta" sayılmaz', () => {
    // Haftalık Akış MANUEL açılıyor (bu turda doğrulanmış bilinçli
    // tasarım). Akış açılmamışken ödevleri güncel hafta saymak,
    // olmayan bir haftayı varmış gibi göstermek olurdu.
    const split = splitByFlowOwnership([batch('a', 'flow-1'), batch('b', null)], null)
    expect(split.currentWeek).toEqual([])
    expect(split.pastDebt.map(b => b.id)).toEqual(['a', 'b'])
  })
})

// ============================================================
// R7-06.03 · Öğrencinin günlük dağıtımı
// ============================================================

describe('R7-06.03 · günlük dağıtım veri modeli', () => {
  it('planned_for_date sütunu açıldı', () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS planned_for_date DATE')
  })

  it('öğrencinin planı İKİNCİ BİR DEADLINE yaratmaz', () => {
    // 077 kabul #3. Plan yazan RPC ne ödevin teslim tarihine ne de
    // akışın kapanışına dokunabilir; dokunsaydı öğrenci kendi son
    // teslimini belirlemiş olurdu.
    const fn = sqlBetween(
      'CREATE OR REPLACE FUNCTION public.set_homework_item_plan_date',
      '$fn$;'
    )
    expect(fn).not.toContain('due_date')
    expect(fn).not.toContain('due_at')
  })

  it('aktif yükte olmayan çalışma planlanamaz', () => {
    // Aksi halde aktif yükten çıkardığımız borcu öğrenci kendi planına
    // ekleyerek geri getirebilirdi.
    const fn = sqlBetween(
      'CREATE OR REPLACE FUNCTION public.set_homework_item_plan_date',
      '$fn$;'
    )
    expect(fn).toContain("v_batch.status <> 'active' OR v_item.status = 'cancelled'")
  })

  it('görünüm gerçek dağıtım sayısını üretir — tahmin yok', () => {
    // Önceden "planlanan" = total - lateAdded diye TAHMİN ediliyordu.
    expect(MIGRATION).toContain('AS weekly_planned_units')
  })
})

// ============================================================
// R7-06.04 · Onay sonrası Geri Al yok
// ============================================================

describe('R7-06.04 · onaylanmış çalışma öğrenci tarafından geri alınamaz', () => {
  const revert = () =>
    sqlBetween('CREATE OR REPLACE FUNCTION public.revert_homework_item_completion', '$fn$;')

  it('kural RPC içinde — arayüzde düğmeyi gizlemek yeterli değil', () => {
    expect(revert()).toContain("IF v_item.status = 'completed' AND NOT v_is_teacher THEN")
  })

  it('onay BEKLEYEN çalışma hâlâ geri çekilebilir', () => {
    // Belge ayrımı: "Onay beklerken öğrenci yanlış gönderimi geri
    // çekebilir." Yani kısıt yalnız 'completed' için.
    expect(revert()).toContain("v_item.status NOT IN ('completed', 'pending_approval')")
  })

  it('öğretmen onaylanmışı hâlâ açabilir', () => {
    // "Gerekirse yeniden açma yetkisi yalnız öğretmen tarafında
    // bulunmalı" — yani yetki kaldırılmıyor, daraltılıyor.
    expect(revert()).toContain("ARRAY['owner', 'teacher']")
  })
})

// ============================================================
// R7-06.05 · "Bu Hafta" yalnız aktif akışı sayar
// ============================================================

describe('R7-06.05 · akış kapsamlı onay sayacı', () => {
  it('görünüm akışa bağlı pending_approval sayacı üretir', () => {
    expect(MIGRATION).toContain('AS weekly_pending_approval')
  })

  it('hafta-bağımsız GLOBAL sayaç kaldırılmadı', () => {
    // 017'nin kararı doğruydu, yalnız yeri yanlıştı: Görevler ekranı
    // geçmiş haftaların onay kuyruğunu görmeye devam etmeli.
    expect(MIGRATION).toContain('AS approval_pending_count')
    expect(MIGRATION).toContain('student_pending_approval_view')
  })

  it('akış yükü yalnız AKTİF partileri sayar', () => {
    // R7-06.01 ile bağ: aktif yükten çıkarılan ödev haftanın yükünden
    // de düşmeli.
    expect(MIGRATION).toContain("hb.status = 'active'")
  })
})

// ============================================================
// R7-06.06 · Son teslim / son hareket ayrımı
// ============================================================

describe('R7-06.06 · "Son teslim: bugün" çelişkisi', () => {
  const now = new Date('2026-09-17T09:00:00+03:00')

  it('son GÖNDERİM cümlesi artık "Son teslim" demiyor', () => {
    // KÖK NEDEN: hesap doğruydu, AD yanlıştı. Bu cümle öğrencinin son
    // gönderimini anlatıyor; aynı kartta akışın kapanışı da "Son
    // Teslim" adını taşıdığı için okuyan kişi "deadline bugün" diye
    // okudu — ve haklıydı.
    const phrase = deliverySilence({ lastDeliveryAt: now, now }).phrase
    expect(phrase).toBe('Son hareket: bugün')
    expect(phrase).not.toContain('Son teslim')
  })

  it('17 Eylül -> 20 Eylül 10:00 için "bugün" GÖRÜNMEZ', () => {
    // Belgenin kabul kriteri birebir.
    const label = dueLabel({ dueAt: new Date('2026-09-20T10:00:00+03:00'), now })
    expect(label).toContain('3 gün kaldı')
    expect(label.toLowerCase()).not.toContain('bugün')
  })

  it('yarın ve bugün ayrı ayrı ve SAATLE söylenir', () => {
    // Kapanış saatli bir andır: "yarın" demek 23:00'te teslim
    // edilebileceğini ima ederdi.
    expect(dueLabel({ dueAt: new Date('2026-09-18T10:00:00+03:00'), now })).toBe(
      'Yarın 10:00'
    )
    expect(dueLabel({ dueAt: new Date('2026-09-17T10:00:00+03:00'), now })).toBe(
      'Bugün 10:00'
    )
  })

  it('kapanış geçtiyse kalan süre uydurulmaz', () => {
    expect(dueLabel({ dueAt: new Date('2026-09-14T10:00:00+03:00'), now })).toContain(
      'Son teslim geçti'
    )
    // Aynı gün ama saati geçmiş.
    expect(dueLabel({ dueAt: new Date('2026-09-17T08:00:00+03:00'), now })).toContain(
      'Son teslim geçti'
    )
  })

  it('saat EUROPE/ISTANBUL üzerinden basılır', () => {
    // Bu paketin DOĞRULANMIŞ maddesi saat dilimi kaymasıydı (Pazar
    // 10:00 ekranda 07:00 görünüyordu). Sunucu UTC'de çalıştığı için
    // biçimlendirme saat dilimini kendi sabitlemek zorunda — bu test
    // makinenin saat diliminden bağımsız olarak geçer.
    const label = dueLabel({
      dueAt: new Date('2026-09-20T07:00:00Z'), // = 10:00 Istanbul
      now,
    })
    expect(label).toContain('10:00')
    expect(label).not.toContain('07:00')
  })
})

// ============================================================
// R7-06.07 · Deterministik test/sayfa sırası
// ============================================================

describe('R7-06.07 · ödev içi sıra', () => {
  it('Parabol kapsamı 1, 3, 4, 5, 6, 7 sırasıyla gelir', () => {
    // Belgenin kabul kriteri: öğrenci 4,6,1,7,5,3 görüyordu.
    const scrambled = [4, 6, 1, 7, 5, 3].map(n => ({
      sectionOrderIndex: 1,
      unitOrderIndex: n,
    }))
    expect(sortHomeworkItems(scrambled).map(i => i.unitOrderIndex)).toEqual([
      1, 3, 4, 5, 6, 7,
    ])
  })

  it('önce BÖLÜM sırası, sonra test numarası', () => {
    const items = [
      { sectionOrderIndex: 2, unitOrderIndex: 1 },
      { sectionOrderIndex: 1, unitOrderIndex: 9 },
    ]
    expect(sortHomeworkItems(items)).toEqual([
      { sectionOrderIndex: 1, unitOrderIndex: 9 },
      { sectionOrderIndex: 2, unitOrderIndex: 1 },
    ])
  })

  it('numarasız kalem sonda toplanır', () => {
    // Başa koymak, numaralı olanların sırasını görünmez kılardı.
    const items = [
      { sectionOrderIndex: 1, unitOrderIndex: null },
      { sectionOrderIndex: 1, unitOrderIndex: 2 },
    ]
    expect(sortHomeworkItems(items).map(i => i.unitOrderIndex)).toEqual([2, null])
  })

  it('sıralama girdiyi BOZMAZ', () => {
    const items = [
      { sectionOrderIndex: 1, unitOrderIndex: 3 },
      { sectionOrderIndex: 1, unitOrderIndex: 1 },
    ]
    sortHomeworkItems(items)
    expect(items.map(i => i.unitOrderIndex)).toEqual([3, 1])
  })

  it('eşitlikte 0 döner — sıra kararlı kalır', () => {
    const a = { sectionOrderIndex: 1, unitOrderIndex: 1 }
    expect(compareHomeworkItems(a, { ...a })).toBe(0)
  })
})

// ============================================================
// R7-06.08 · İlk yayın "sonradan eklendi" değildir
// ============================================================

describe('R7-06.08 · sonradan eklenen yük', () => {
  // Testteki gerçek zamanlar: akış 06:38'de açıldı, ilk yük 06:58'de
  // yayınlandı. Eski kural (akış açılışı + 60 sn payı) bu yirmi
  // dakikayı aştığı için 6 çalışmayı "sonradan eklendi" saydı.
  const firstPublishedAt = new Date('2026-09-17T06:58:00+03:00')

  it('ilk yayın BAŞLANGIÇ YÜKÜDÜR — akış ne zaman açıldığına bakılmaz', () => {
    expect(isLateAdded({ publishedAt: firstPublishedAt, firstPublishedAt })).toBe(false)
  })

  it('ikinci yayın sonradan eklenmiş sayılır', () => {
    expect(
      isLateAdded({
        publishedAt: new Date('2026-09-18T14:00:00+03:00'),
        firstPublishedAt,
      })
    ).toBe(true)
  })

  it('aynı anda yayınlanan partilerin hepsi başlangıç yüküdür', () => {
    // Pay gerekmemesinin sebebi: ilk yayın tanım gereği
    // firstPublishedAt'e eşit.
    expect(isLateAdded({ publishedAt: new Date(firstPublishedAt), firstPublishedAt })).toBe(
      false
    )
  })

  it('hiç yayın yoksa hiçbir şey sonradan eklenmiş değildir', () => {
    expect(isLateAdded({ publishedAt: null, firstPublishedAt })).toBe(false)
    expect(isLateAdded({ publishedAt: firstPublishedAt, firstPublishedAt: null })).toBe(false)
  })
})

// ============================================================
// R7-06.10 · Seçim uygunluğu açık anlatılır
// ============================================================

describe('R7-06.10 · seçimin neden kısmen uygun olduğu', () => {
  it('38 sayfa seçili / 2 eklenebilir / 36 zaten ödevde', () => {
    // Belgenin kendi örneği.
    const states: HomeworkTestState[] = [
      ...Array<HomeworkTestState>(2).fill('not_assigned'),
      ...Array<HomeworkTestState>(20).fill('assigned'),
      ...Array<HomeworkTestState>(16).fill('overdue'),
    ]
    expect(describeAssignEligibility(states, 'sayfa')).toBe(
      '38 sayfa seçili · 2 ödeve eklenebilir · 36 zaten ödevde veya süresi geçmiş'
    )
  })

  it('tamamlanmış seçim ayrı bir sebep olarak adlandırılır', () => {
    // "Zaten ödevde" ile "tamamlanmış" öğretmen için aynı şey değil:
    // biri bekleyen bir iş, öbürü bitmiş bir kayıt.
    const text = describeAssignEligibility(['not_assigned', 'assigned', 'completed'], 'test')
    expect(text).toContain('1 zaten ödevde veya süresi geçmiş')
    expect(text).toContain('1 tamamlanmış')
  })

  it('hepsi uygunsa cümle HİÇ kurulmaz', () => {
    // Sıfırı duyurmak gürültüdür.
    expect(describeAssignEligibility(['not_assigned', 'not_assigned'], 'test')).toBeNull()
  })

  it('toplam her zaman tutar — adlandırılamayan engel de sayılır', () => {
    const text = describeAssignEligibility(['not_assigned', 'no_test'], 'test')
    expect(text).toContain('2 test seçili')
    expect(text).toContain('1 ödeve eklenebilir')
    expect(text).toContain('1 uygun değil')
  })
})

// ============================================================
// R7-06.11 · Sayaç etiketleri kapsamı söyler
// ============================================================

describe('R7-06.11 · "Geciken 0" çelişkisi', () => {
  it('öğrenciye gösterilen etiket kapsamı söyler', () => {
    // Aynı ekranda "5 gecikmiş ödev" ile "Geciken 0" yan yanaydı;
    // ikisi de doğruydu, biri neyin sıfırı olduğunu söylemiyordu.
    expect(counterLabel('overdueThisWeek', 'student')).toBe('Bu hafta geciken')
    expect(counterLabel('pastDebt', 'student')).toBe('Geçmiş borç')
  })

  it('eski kapsamsız etiket hâlâ duruyor — başka ekranlar onu kullanıyor', () => {
    expect(counterLabel('overdue', 'student')).toBe('Süresi Geçen')
  })
})

// ============================================================
// KORUNACAK DAVRANIŞLAR (belge §4)
// ============================================================

describe('R7-06 · korunacak davranışlar', () => {
  it('teslim ÖĞRENCİNİN GÖNDERİMİDİR, öğretmen onayı değil', () => {
    // 081'in düzelttiği hata. Onaya bağlansaydı öğretmenin geç bakması
    // öğrenciyi geride gösterirdi.
    expect(MIGRATION).toContain("hi.status IN ('pending_approval', 'completed')")
  })

  it('üç gün teslim yoksa sessizlik sinyali cümlesi DEĞİŞMEDİ', () => {
    const now = new Date('2026-09-17T09:00:00+03:00')
    const silence = deliverySilence({
      lastDeliveryAt: new Date('2026-09-13T09:00:00+03:00'),
      now,
    })
    expect(silence.silent).toBe(true)
    expect(silence.phrase).toBe('4 gündür yeni teslim yok')
  })

  it('hiç teslim yokken çağıranın cümlesi korunur', () => {
    expect(
      deliverySilence({
        lastDeliveryAt: null,
        now: new Date(),
        emptyPhrase: 'Bu hafta teslim yok',
      }).phrase
    ).toBe('Bu hafta teslim yok')
  })
})
