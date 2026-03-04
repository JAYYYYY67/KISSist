import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (
        !user &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        request.nextUrl.pathname !== '/'
    ) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    if (user && (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/api/admin'))) {
        const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
        const userEmail = user.email?.toLowerCase() || ''

        if (!adminEmails.includes(userEmail)) {
            if (request.nextUrl.pathname.startsWith('/api/')) {
                return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 })
            } else {
                const url = request.nextUrl.clone()
                url.pathname = '/assistant'
                return NextResponse.redirect(url)
            }
        }
    }

    return supabaseResponse
}

export async function middleware(request: NextRequest) {
    if (request.nextUrl.pathname === "/api/admin/pin" || request.nextUrl.pathname === "/api/health") {
        return NextResponse.next()
    }

    try {
        return await updateSession(request)
    } catch (error: any) {
        return new NextResponse(
            JSON.stringify({
                error: 'Middleware Invocation Failed Locally',
                message: error?.message || String(error),
                stack: error?.stack
            }),
            { status: 500, headers: { 'content-type': 'application/json' } }
        )
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
