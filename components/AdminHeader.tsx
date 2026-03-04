'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AdminHeader() {
    const supabase = createClient()
    const router = useRouter()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.refresh()
        router.push('/')
    }

    return (
        <header className="relative z-10 bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700/50 px-6 py-4 flex items-center justify-between sticky top-0">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#5417cf] rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-[#5417cf]/30">
                    A
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 italic">KissEng Admin</h1>
            </div>
            <button
                onClick={handleLogout}
                className="text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-xl transition-all border border-slate-200 dark:border-slate-700/50 hover:border-red-200 dark:hover:border-red-800"
            >
                Log Out
            </button>
        </header>
    )
}
