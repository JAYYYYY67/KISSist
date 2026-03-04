import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const adminEmail = process.env.ADMIN_EMAIL
        if (!adminEmail || user.email !== adminEmail) {
            return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }

        const { data: docs, error } = await supabase
            .from('documents')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) throw error

        return NextResponse.json({ ok: true, documents: docs })

    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const adminEmail = process.env.ADMIN_EMAIL
        if (!adminEmail || user.email !== adminEmail) {
            return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })
        }

        // 1. Get file path to delete from storage
        const { data: doc, error: fetchError } = await supabase
            .from('documents')
            .select('file_name')
            .eq('id', id)
            .single()

        if (fetchError) {
            return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 })
        }

        // 2. Delete from DB (Chunks should cascade if FK set, otherwise manual. Usually manual is safer if unsure of DB setup)
        // Assuming CASCADE is set on foreign key in standard Setup. If not, we should delete chunks first.
        // Let's safe delete chunks first to be sure.
        await supabase.from('chunks').delete().eq('document_id', id)

        const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .eq('id', id)

        if (deleteError) throw deleteError

        // 3. Delete from Storage
        if (doc.file_name) {
            await supabase.storage
                .from('materials')
                .remove([doc.file_name])
        }

        return NextResponse.json({ ok: true })

    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
}
