'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [mode, setMode] = useState<'signin' | 'signup'>('signin')
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const router = useRouter()
    const supabase = createClient()

    async function handleAuth(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setMessage(null)

        if (mode === 'signup') {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            })
            if (error) {
                setError(error.message)
            } else {
                router.refresh()
                router.push('/assistant')
            }
        } else {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })
            if (error) {
                setError(error.message)
            } else {
                router.refresh()
                router.push('/assistant')
            }
        }
    }

    async function handleResetPassword() {
        setError(null)
        setMessage(null)

        if (!email) {
            setError('이메일을 먼저 입력해주세요.')
            return
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'http://localhost:3000/auth/callback',
        })

        if (error) {
            setError(error.message)
        } else {
            setMessage('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해주세요.')
        }
    }

    return (
        <div className="font-sans bg-[#f6f6f8] text-slate-900 min-h-screen relative overflow-hidden flex flex-col dark:bg-[#161121] dark:text-slate-100">
            {/* Abstract Background Elements */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#0B1E59]/20 blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-950/30 blur-[150px]"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-br from-[#161121] via-[#161121] to-[#201633] opacity-0 dark:opacity-100 transition-opacity"></div>
            </div>

            {/* Main Content */}
            <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-[440px]">
                    {/* Glassmorphism Card */}
                    <div className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8 shadow-2xl relative overflow-hidden">

                        <div className="text-center mb-10">
                            {/* Brand Header inside card for focus */}
                            <div className="flex justify-center items-center gap-2 mb-6">
                                <div className="bg-[#0B1E59] p-2 rounded-xl flex items-center justify-center shadow-lg shadow-[#0B1E59]/30">
                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                                <h2 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100 italic">KISSist</h2>
                            </div>

                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                {mode === 'signin' ? 'Welcome Back' : 'Create an Account'}
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400">
                                {mode === 'signin' ? 'Access your sophisticated assistant' : 'Sign up to get started'}
                            </p>
                        </div>

                        {error && (
                            <div className="mb-6 p-3 bg-red-100/80 border border-red-200 text-red-700 text-sm rounded-lg backdrop-blur-sm">
                                {error}
                            </div>
                        )}
                        {message && (
                            <div className="mb-6 p-3 bg-green-100/80 border border-green-200 text-green-700 text-sm rounded-lg backdrop-blur-sm">
                                {message}
                            </div>
                        )}

                        <form className="space-y-5" onSubmit={handleAuth}>
                            {/* Email Field */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">Email address</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                        </svg>
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-white dark:bg-[#161121]/50 border border-slate-300 dark:border-slate-700 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1E59]/50 focus:border-[#0B1E59] transition-all"
                                        placeholder="name@university.edu"
                                    />
                                </div>
                            </div>

                            {/* Password Field */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center ml-1">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Password</label>
                                    {mode === 'signin' && (
                                        <button
                                            type="button"
                                            onClick={handleResetPassword}
                                            className="text-xs text-[#0B1E59] dark:text-[#3d5ab3] font-bold hover:underline"
                                        >
                                            Forgot password?
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-white dark:bg-[#161121]/50 border border-slate-300 dark:border-slate-700 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1E59]/50 focus:border-[#0B1E59] transition-all"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 space-y-4">
                                <button
                                    type="submit"
                                    className="w-full bg-gradient-to-r from-[#0B1E59] to-blue-800 hover:from-[#081745] hover:to-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-[#0B1E59]/20 transition-all active:scale-[0.98] tracking-wide"
                                >
                                    {mode === 'signin' ? 'Sign in' : 'Complete Sign up'}
                                </button>

                                <div className="relative py-2">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t border-slate-200 dark:border-slate-700/50"></span>
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase font-bold tracking-wider">
                                        <span className="bg-[#f6f6f8] dark:bg-[#161121] px-4 text-slate-400 rounded-full">Or</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode(mode === 'signin' ? 'signup' : 'signin')
                                        setError(null)
                                        setMessage(null)
                                    }}
                                    className="w-full border-2 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300 font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 bg-white/50 dark:bg-transparent"
                                >
                                    {mode === 'signin' ? 'Create new account' : 'Sign in safely'}
                                </button>
                            </div>
                        </form>
                    </div>

                    <p className="mt-8 text-center text-xs text-slate-500 font-medium">
                        By signing in, you agree to our
                        <a className="underline hover:text-slate-700 dark:hover:text-slate-300 ml-1" href="#">Terms of Service</a> and
                        <a className="underline hover:text-slate-700 dark:hover:text-slate-300 ml-1" href="#">Privacy Policy</a>.
                    </p>
                </div>
            </main>
        </div>
    )
}
