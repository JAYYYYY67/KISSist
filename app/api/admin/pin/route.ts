import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (process.env.NODE_ENV === 'development') {
            console.log("[pin] Cookie header exists:", request.headers.has('cookie'))
            console.log("[pin] userEmail=", user?.email ?? "none")
        }

        if (!user) {
            if (process.env.NODE_ENV === 'development') console.log("[pin] Returning 401 (No User)")
            return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
        }

        const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
        if (!adminEmails.includes(user.email?.toLowerCase() || '')) {
            if (process.env.NODE_ENV === 'development') console.log("[pin] Returning 403 (Not Admin)")
            return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const pin = String(body.pin ?? "").trim()

        const adminPinHash = process.env.ADMIN_PIN_HASH

        if (!pin) {
            if (process.env.NODE_ENV === 'development') console.log("[pin] Returning 400 (Empty PIN)")
            return NextResponse.json({ ok: false, error: 'Enter PIN' }, { status: 400 })
        }

        if (!adminPinHash) {
            if (process.env.NODE_ENV === 'development') console.log("[pin] ADMIN_PIN_HASH missing")
            return NextResponse.json({ ok: false, error: 'ADMIN_PIN_HASH missing' }, { status: 403 })
        }

        const trimmedHash = adminPinHash.trim()
        let match = false

        if (trimmedHash.startsWith('$2a$') || trimmedHash.startsWith('$2b$')) {
            match = await bcrypt.compare(pin, trimmedHash)
        } else {
            const sha256Hash = crypto.createHash('sha256').update(pin).digest('hex')
            match = (sha256Hash === trimmedHash)
        }

        if (match) {
            const response = NextResponse.json({ ok: true })

            // Set cookie
            response.cookies.set('admin_gate', '1', {
                httpOnly: true,
                maxAge: 60 * 30, // 30 minutes
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
            })

            if (process.env.NODE_ENV === 'development') console.log("[pin] Returning 200 (Success)")
            return response
        } else {
            if (process.env.NODE_ENV === 'development') console.log("[pin] Returning 401 (Invalid PIN)")
            return NextResponse.json({ ok: false, error: 'Invalid PIN' }, { status: 401 })
        }

    } catch (error) {
        console.error('PIN Verification Error:', error)
        return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
    }
}
