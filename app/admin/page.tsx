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

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    const userEmail = user.email?.toLowerCase() || ''
    const role = adminEmails.includes(userEmail) ? 'admin' : 'assistant'

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
        <div className="font-sans bg-[#f6f6f8] text-slate-900 min-h-screen relative overflow-hidden flex flex-col dark:bg-[#161121] dark:text-slate-100">
            {/* Abstract Background Elements */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#0B1E59]/20 blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-950/30 blur-[150px]"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-br from-[#161121] via-[#161121] to-[#201633] opacity-0 dark:opacity-100 transition-opacity"></div>
            </div>

            <AdminHeader />
            <main className="relative z-10 flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
                <div className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700/50 p-6 md:p-8">
                    <h1 className="text-2xl font-bold mb-3 text-slate-800 dark:text-slate-100">Admin Console</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Protected Admin Area</p>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Link href="/admin/indexing" className="p-6 border border-slate-200 dark:border-slate-700/50 rounded-xl bg-white/40 dark:bg-slate-800/40 hover:bg-white/70 dark:hover:bg-slate-800/70 hover:border-[#0B1E59]/50 transition-all group cursor-pointer shadow-sm hover:shadow-md block relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#0B1E59]/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                            <h3 className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#0B1E59] dark:group-hover:text-[#3d5ab3] mb-2 flex items-center gap-2">📄 Upload Materials</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Upload and chunk PDF textbooks for the knowledge base.</p>
                            <span className="mt-4 flex items-center gap-1 text-sm font-bold text-[#0B1E59] dark:text-[#3d5ab3]">Go to Indexing <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></span>
                        </Link>
                        <div className="p-6 border border-slate-200 dark:border-slate-700/50 rounded-xl bg-white/40 dark:bg-slate-800/40 hover:bg-white/70 dark:hover:bg-slate-800/70 hover:border-[#0B1E59]/50 transition-all group cursor-pointer shadow-sm hover:shadow-md opacity-60">
                            <h3 className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#0B1E59] dark:group-hover:text-[#3d5ab3] mb-2">❓ Import Q&A</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Bulk import Q&A pairs via API (UI coming soon).</p>
                            <span className="mt-4 inline-block text-sm font-bold text-slate-400">API Endpoint Active</span>
                        </div>
                        <Link href="/assistant" className="p-6 border border-slate-200 dark:border-slate-700/50 rounded-xl bg-white/40 dark:bg-slate-800/40 hover:bg-white/70 dark:hover:bg-slate-800/70 hover:border-[#0B1E59]/50 transition-all group cursor-pointer shadow-sm hover:shadow-md block relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#0B1E59]/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                            <h3 className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#0B1E59] dark:group-hover:text-[#3d5ab3] mb-2 flex items-center gap-2">🤖 Assistant View (Test)</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Access the Assistant interface to test Q&A retrieval.</p>
                            <span className="mt-4 flex items-center gap-1 text-sm font-bold text-[#0B1E59] dark:text-[#3d5ab3]">Go to Assistant <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></span>
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    )
}
