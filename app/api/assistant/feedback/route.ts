import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

export async function POST(request: Request) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
        return NextResponse.json({ ok: false, error: 'Missing OPENAI_API_KEY' }, { status: 500 })
    }

    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // Allow authenticated users (e.g. TAs)
        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { question, modelAnswer, finalAnswer, comment, courseKey, referenceMeta, lowConfidence } = body

        if (!question || !modelAnswer || !finalAnswer) {
            return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
        }

        let vectorString: string | null = null

        // Generate embedding if TA provided a final answer
        if (finalAnswer && finalAnswer.trim().length > 0) {
            const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
            const embeddingResponse = await openai.embeddings.create({
                model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                input: finalAnswer.replace(/\n/g, ' ')
            })

            const embedding = embeddingResponse.data[0].embedding
            vectorString = `[${embedding.map(v => v.toFixed(8)).join(',')}]`
        }

        // Insert into Supabase
        const { error } = await supabase.from('assistant_feedback').insert({
            created_by: user.id,
            created_by_email: user.email || null,
            question,
            course_key: courseKey || null,
            model_answer: modelAnswer,
            final_answer: finalAnswer.trim(),
            comment: comment?.trim() || null,
            reference_meta: referenceMeta || null,
            low_confidence: !!lowConfidence,
            embedding: vectorString
        })

        if (error) {
            console.error('[Feedback] Insertion Error:', error)
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ ok: true })

    } catch (err: any) {
        console.error('[Feedback] Uncaught Error:', err)
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
    }
}
