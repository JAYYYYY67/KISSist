import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')

    if (!code) {
        return NextResponse.redirect(`${origin}/login?error=missing_code`)
    }

    // Use the existing supabase server client (lib/supabase/server.ts) 
    // which automatically captures logic to securely store active session cookies
    const supabase = await createClient()

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent(error.message)}`
        )
    }

    // Success: Redirect to the dedicated reset password page
    return NextResponse.redirect(`${origin}/auth/reset-password`)
}
