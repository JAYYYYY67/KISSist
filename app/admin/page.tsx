import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import AdminPinForm from '@/components/AdminPinForm'
import AdminHeader from '@/components/AdminHeader'

export default async function AdminPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const role = user.email === process.env.ADMIN_EMAIL ? 'admin' : 'assistant'

    if (role !== 'admin') {
        redirect('/')
    }

    // Check for admin PIN gate cookie
    const cookieStore = await cookies()
    const hasPinGate = cookieStore.get('admin_gate')

    if (!hasPinGate) {
        return <AdminPinForm />
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <AdminHeader />
            <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    <h1 className="text-2xl font-bold mb-4 text-gray-800">Admin Console</h1>
                    <p className="text-gray-500">Protected Admin Area</p>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Link href="/admin/indexing" className="p-6 border border-gray-100 rounded-lg bg-gray-50 hover:bg-white hover:border-blue-200 transition-all group cursor-pointer shadow-sm hover:shadow-md block">
                            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-2">📄 Upload Materials</h3>
                            <p className="text-sm text-gray-500">Upload and chunk PDF textbooks for the knowledge base.</p>
                            <span className="mt-4 inline-block text-sm font-medium text-blue-600">Go to Indexing →</span>
                        </Link>
                        <div className="p-6 border border-gray-100 rounded-lg bg-gray-50 hover:bg-white hover:border-blue-200 transition-all group cursor-pointer shadow-sm hover:shadow-md opacity-60">
                            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-2">❓ Import Q&A</h3>
                            <p className="text-sm text-gray-500">Bulk import Q&A pairs via API (UI coming soon).</p>
                            <span className="mt-4 inline-block text-sm font-medium text-gray-400">API Endpoint Active</span>
                        </div>
                        <Link href="/assistant" className="p-6 border border-gray-100 rounded-lg bg-gray-50 hover:bg-white hover:border-blue-200 transition-all group cursor-pointer shadow-sm hover:shadow-md block">
                            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-2">🤖 Assistant View (Test)</h3>
                            <p className="text-sm text-gray-500">Access the Assistant interface to test Q&A retrieval.</p>
                            <span className="mt-4 inline-block text-sm font-medium text-blue-600">Go to Assistant →</span>
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    )
}
