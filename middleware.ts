import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // 1. env 누락 시 안전하게 next() 처리 및 로그 남기기
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[Middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
        return NextResponse.next()
    }

    try {
        let res = NextResponse.next({
            request,
        })

        const supabase = createServerClient(
            supabaseUrl,
            supabaseAnonKey,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll()
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value }) =>
                            request.cookies.set(name, value)
                        )
                        res = NextResponse.next({
                            request,
                        })
                        cookiesToSet.forEach(({ name, value, options }) =>
                            res.cookies.set(name, value, options)
                        )
                    },
                },
            }
        )

        const {
            data: { user },
        } = await supabase.auth.getUser()

        // 보호된 경로(matcher)에 접근했는데 로그인 안 된 경우
        if (!user) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/login'
            const redirectResponse = NextResponse.redirect(redirectUrl)

            // 핵심: 로그인 만료/리다이렉트 전 갱신된 쿠키를 방출될 응답에 그대로 복사해줍니다.
            res.cookies.getAll().forEach((cookie) => {
                redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
            })
            return redirectResponse
        }

        // admin 경로 권한 체크
        if (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/api/admin')) {
            const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
            const userEmail = user.email?.toLowerCase() || ''

            if (!adminEmails.includes(userEmail)) {
                if (request.nextUrl.pathname.startsWith('/api/')) {
                    const jsonRes = NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 })
                    res.cookies.getAll().forEach((cookie) => {
                        jsonRes.cookies.set(cookie.name, cookie.value, cookie)
                    })
                    return jsonRes
                } else {
                    const redirectUrl = request.nextUrl.clone()
                    redirectUrl.pathname = '/assistant'
                    const redirectResponse = NextResponse.redirect(redirectUrl)
                    res.cookies.getAll().forEach((cookie) => {
                        redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
                    })
                    return redirectResponse
                }
            }
        }

        return res

    } catch (error) {
        // 2. 예외 발생 시 죽지 않게 (fail-open)
        console.error('[Middleware] Unexpected error:', error)
        return NextResponse.next()
    }
}

// 3. matcher를 최소로 제한
export const config = {
    matcher: [
        '/assistant/:path*',
        '/admin/:path*',
        '/api/admin/:path*'
    ],
}
