import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AssistantClient from './AssistantClient'

export default async function AssistantPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const isAdmin = user.email === process.env.ADMIN_EMAIL

    return <AssistantClient isAdmin={isAdmin} />
}
