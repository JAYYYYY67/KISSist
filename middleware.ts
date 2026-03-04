import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/auth-guard'

export async function middleware(request: NextRequest) {
    if (request.nextUrl.pathname === "/api/admin/pin" || request.nextUrl.pathname === "/api/health") {
        return NextResponse.next()
    }
    // We need a middleware helper to handle supabase session refresh
    // But for now, using a simplified version or just calling updateSession if we had it.
    // Since I didn't create lib/supabase/middleware.ts in the plan (I missed it),
    // I will implement the logic directly here or create the helper.
    // The plan said "Check for session (using lib/supabase/server helper)".
    // However, middleware cannot use 'lib/supabase/server' because it uses 'next/headers' cookies() 
    // which is not fully available in middleware the same way or requires different handling.
    // Actually, Supabase SSR docs recommend a specific middleware client.

    // Let's create a simple middleware that just passes for now or does basic check if possible.
    // Without the proper cookie handling helper for middleware, it's tricky.
    // I will create a basic version.

    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
