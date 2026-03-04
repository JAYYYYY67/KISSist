import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/route')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Minimal Header */}
      <header className="px-6 py-6">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
          K
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center -mt-20">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
          Your AI Teaching Assistant
        </h1>
        <p className="text-lg md:text-xl text-gray-500 max-w-lg mb-10 leading-relaxed">
          Streamline your English Q&A workflow managed by KissEng.
        </p>

        <Link
          href="/login"
          className="group relative inline-flex items-center justify-center px-8 py-3.5 text-lg font-semibold text-white transition-all duration-200 bg-blue-600 font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 hover:bg-blue-700 hover:shadow-lg transform hover:-translate-y-1"
        >
          Sign In
        </Link>
      </main>

      {/* Simple Footer */}
      <footer className="py-8 text-center text-sm text-gray-400">
        &copy; {new Date().getFullYear()} KissEng. All rights reserved.
      </footer>
    </div>
  )
}
