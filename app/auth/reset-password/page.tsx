'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    // Create the supabase client instance (client-side)
    const supabase = createClient()

    async function handleUpdate(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (password.length < 8) {
            setError('비밀번호는 8자 이상이어야 합니다.')
            return
        }

        if (password !== confirm) {
            setError('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.')
            return
        }

        // Call updateUser to update the password for the current active user
        // (the active session is established via exchangeCodeForSession prior to this route)
        const { error } = await supabase.auth.updateUser({
            password: password
        })

        if (error) {
            setError(error.message)
        } else {
            alert('비밀번호가 성공적으로 변경되었습니다. 다시 로그인 해 주세요.')
            router.push('/login')
        }
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="text-center text-3xl font-extrabold text-gray-900">
                    비밀번호 재설정
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    새로운 비밀번호를 입력해 주세요.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleUpdate}>
                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4">
                                {error}
                            </div>
                        )}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                새 비밀번호
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    placeholder="8자 이상"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">
                                새 비밀번호 확인
                            </label>
                            <div className="mt-1">
                                <input
                                    id="confirm"
                                    type="password"
                                    required
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    placeholder="비밀번호 다시 입력"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                비밀번호 변경
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
