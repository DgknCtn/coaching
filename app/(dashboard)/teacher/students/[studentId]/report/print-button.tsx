'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Raporu tarayıcının yazdır/PDF'e kaydet diyaloğuyla dışa aktarır.
export function PrintButton() {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => window.print()}
      className="gap-2 rounded-xl h-9 font-semibold print:hidden"
    >
      <Printer className="size-4" /> Yazdır / PDF
    </Button>
  )
}
