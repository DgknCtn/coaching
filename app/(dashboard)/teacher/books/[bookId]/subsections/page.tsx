import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SubsectionList, type SubsectionRow } from '../edit/subsection-list'

export const dynamic = 'force-dynamic'

// R7-03 §2 — KİTAP EKLEMENİN 2. ADIMI
//
// NEDEN AYRI BİR EKRAN: şartname "Bölüm satırına '+ Alt Bölüm Ekle'
// aksiyonu ekle" diyor ama ekleme formuna gömmek iki şeyi bozuyordu.
// Birincisi form zaten 400 satır ve 30 bölümlü bir kitapta iç içe iki
// dizi alanı (bölüm → alt bölüm) tarayıcıda tek ekrana sığmıyor.
// İkincisi ve asıl önemlisi: alt bölüm kaydı BÖLÜM KİMLİĞİNE bağlanır
// (§3: "İç kimlik test numarasıyla değil ilgili Bölüm/Alt Bölüm
// kaydının ID'siyle tutulmalı") — bölümler kaydedilmeden o kimlikler
// yok. Tek adımda yapılsaydı istemcinin geçici kimlik uydurup sunucuda
// eşlemesi gerekirdi; bu, şartnamenin kaçınmamızı istediği şeyin ta
// kendisi.
//
// Bu yüzden 1. adım kitabı ve bölümleri kurar, 2. adım gerçek kimlikler
// üzerinde alt bölümleri kurar. Adım isteğe bağlıdır: alt bölüm zorunlu
// değildir (§1), "Alt bölüm eklemeden bitir" her zaman açıktır.
//
// SAYFA KİTAPLARI BURAYA HİÇ GELMEZ: 061'de add_book_subsection sayfa
// kitaplarını açıkça reddediyor. Yönlendirme book-form.tsx'te yapılıyor;
// buraya elle gelinirse aşağıdaki uyarı çıkar.
export default async function BookSubsectionsPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: book } = await supabase
    .from('books')
    // Gömmeler düzenleme ekranıyla aynı: kullanılmış test sayısı
    // olmadan dönüştürme düğmesinin açık mı kapalı mı olacağı
    // bilinemez (076).
    .select(`
      id, title, status, tracking_mode,
      book_sections(
        id, title, order_index, parent_section_id, test_start, test_end,
        book_tests(id, homework_items(id), test_completions(id))
      )
    `)
    .eq('id', bookId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!book || book.status === 'archived') notFound()

  const isPageBook = book.tracking_mode === 'page'

  const allSections = (book.book_sections ?? []).slice().sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  )

  // Alt bölüm, parent_section_id ile bölüme bağlı bir book_sections
  // kaydıdır — ayrı tablo değil. Üst bölümler ile alt bölümler bu
  // yüzden aynı listeden ayrıştırılır.
  const subsectionsByParent = new Map<string, typeof allSections>()
  for (const s of allSections) {
    if (!s.parent_section_id) continue
    const list = subsectionsByParent.get(s.parent_section_id) ?? []
    list.push(s)
    subsectionsByParent.set(s.parent_section_id, list)
  }

  const testsOf = (s: (typeof allSections)[number]) => s.book_tests ?? []

  const sections = allSections
    .filter(s => !s.parent_section_id)
    .map(s => ({
      id: s.id,
      title: s.title,
      testCount: testsOf(s).length,
      usedTestCount: testsOf(s).filter(
        t =>
          ((t as { homework_items?: unknown[] }).homework_items ?? []).length > 0 ||
          ((t as { test_completions?: unknown[] }).test_completions ?? []).length > 0
      ).length,
      subsections: (subsectionsByParent.get(s.id) ?? []).map(
        (sub): SubsectionRow => ({
          id: sub.id,
          title: sub.title,
          testStart: sub.test_start,
          testEnd: sub.test_end,
          testCount: testsOf(sub).length,
        })
      ),
    }))

  const withSubsections = sections.filter(s => s.subsections.length > 0).length

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" render={<Link href="/teacher/books" />}>
          <ArrowLeft className="size-4" />
          Kitap havuzu
        </Button>

        <div className="space-y-1">
          {/* Adım göstergesi: 1. adımı bitiren öğretmen kitabın
              kaydedildiğini bilmeli, yoksa bu ekran "kayıt olmadı mı?"
              hissi verir. */}
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            ADIM 2 / 2 · ALT BÖLÜMLER
          </p>
          <h1 className="text-xl font-semibold">{book.title}</h1>
          <p className="text-sm text-muted-foreground">
            Kitap kaydedildi. Bir bölüm çok konuluysa ve her konuya ayrı ödev
            verilecekse alt bölümlere ayırın — ödev ve ilerleme en alt çalışma
            biriminde takip edilir. Bu adım isteğe bağlıdır.
          </p>
        </div>
      </div>

      {isPageBook ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">
              Bu kaynak sayfa ile takip ediliyor; sayfa takipli kaynakta alt
              bölüm açılmaz. İlerleme ve ödev sayfa üzerinden yürür.
            </p>
          </CardContent>
        </Card>
      ) : sections.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">
              Bu kitapta bölüm yok. Bölümleri düzenleme ekranından
              ekleyebilirsiniz.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sections.map((section, index) => (
            <Card key={section.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-medium">
                    {String(index + 1).padStart(2, '0')}. {section.title}
                  </h2>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {section.subsections.length > 0
                      ? `${section.subsections.length} alt bölüm`
                      : `${section.testCount} test`}
                  </span>
                </div>

                <SubsectionList
                  bookId={bookId}
                  sectionId={section.id}
                  subsections={section.subsections}
                  sectionTestCount={section.testCount}
                  usedTestCount={section.usedTestCount}
                  // Yeni kurulan kitapta ilerleme yoktur. Yine de sabit
                  // false yazılmıyor: bu ekrana sonradan da gelinebilir
                  // ve o zaman değer gerçeği söylemeli.
                  hasProgress={sections.some(s => s.usedTestCount > 0)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button render={<Link href={`/teacher/books/${bookId}`} />}>
          <Check className="size-4" />
          {withSubsections > 0 ? 'Bitir' : 'Alt bölüm eklemeden bitir'}
        </Button>
        <Button variant="ghost" render={<Link href={`/teacher/books/${bookId}/edit`} />}>
          Düzenleme ekranına git
        </Button>
      </div>
    </div>
  )
}
