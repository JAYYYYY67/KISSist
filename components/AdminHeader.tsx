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
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center text-white font-bold">
                    A
                </div>
                <h1 className="text-xl font-semibold text-gray-800 tracking-tight">KissEng Admin</h1>
            </div>
            <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors border border-gray-200 hover:border-red-100"
            >
                Log Out
            </button>
        </header>
    )
}
