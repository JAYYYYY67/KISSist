import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function RouteDispatchPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const adminEmail = process.env.ADMIN_EMAIL
    const isAdmin = !!adminEmail && user.email === adminEmail

    if (isAdmin) {
        redirect('/admin')
    } else {
        redirect('/assistant')
    }
}
