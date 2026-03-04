import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/server'

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

        const adminEmail = process.env.ADMIN_EMAIL
        if (!adminEmail || user.email !== adminEmail) {
            if (process.env.NODE_ENV === 'development') console.log("[pin] Returning 403 (Not Admin)")
            return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const pin = String(body.pin ?? "").trim()

        // Log hash length only (no secrets)
        const adminPinHash = process.env.ADMIN_PIN_HASH
        if (process.env.NODE_ENV === 'development') {
            console.log("[pin] hashLen=", adminPinHash?.length)
        }

        if (!pin) {
            if (process.env.NODE_ENV === 'development') console.log("[pin] Returning 400 (Empty PIN)")
            return NextResponse.json({ ok: false, error: 'Enter PIN' }, { status: 400 })
        }

        if (!adminPinHash) {
            console.error('ADMIN_PIN_HASH is not set in environment variables.')
            return NextResponse.json({ ok: false, error: 'ADMIN_PIN_HASH missing' }, { status: 500 })
        }

        const match = await bcrypt.compare(pin, adminPinHash.trim())

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
