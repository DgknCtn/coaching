import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StudentForm } from './student-form'

export default function NewStudentPage() {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/teacher/students">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">Yeni Öğrenci</h1>
      </div>
      <StudentForm />
    </div>
  )
}
