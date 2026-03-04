import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const role = user.email === process.env.ADMIN_EMAIL ? 'admin' : 'assistant'

    return NextResponse.json({
        email: user.email,
        role,
    })
}
