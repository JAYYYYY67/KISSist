'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function AdminPinForm() {
    const [pin, setPin] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/admin/pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ pin }),
            })

            const data = await res.json()

            if (data.ok) {
                router.refresh()
            } else {
                setError(data.error || 'Invalid PIN')
                setLoading(false)
            }
        } catch {
            setError('Something went wrong')
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-[#161121]">
            <div className="w-full max-w-sm p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl">
                <div className="flex justify-center mb-6">
                    <Image src="/branding/kissist_robot_login_hero_logo.png" alt="KISSist Robot" width={64} height={64} className="object-contain drop-shadow-lg" />
                </div>
                <h2 className="mb-4 text-xl font-bold text-center text-slate-800 dark:text-slate-100">Admin Access PIN</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <div className="p-2 text-sm text-red-600 bg-red-50 rounded">{error}</div>}
                    <div>
                        <label className="block mb-1 text-sm font-medium">Enter PIN</label>
                        <input
                            type="password"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                            autoFocus
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {loading ? 'Verifying...' : 'Unlock'}
                    </button>
                </form>
            </div>
        </div>
    )
}
