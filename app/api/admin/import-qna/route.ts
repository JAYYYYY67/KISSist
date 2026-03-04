import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

// Ensure Node.js runtime for any potential heavier processing
export const runtime = 'nodejs'

export async function POST(request: Request) {
    // STRICT ENV VAR CHECK
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
        console.error('[ImportQnA] OPENAI_API_KEY not found at runtime')
        return NextResponse.json({ ok: false, error: 'Missing OPENAI_API_KEY' }, { status: 500 })
    }

    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized', detail: 'No session user' }, { status: 401 })
        }

        const adminEmail = process.env.ADMIN_EMAIL
        const isAdmin = !!adminEmail && user.email === adminEmail

        if (!isAdmin) {
            return NextResponse.json({ ok: false, error: 'Forbidden', detail: 'Email mismatch' }, { status: 403 })
        }

        // Check for admin_gate cookie
        const cookieStore = await cookies()
        const pinGate = cookieStore.get('admin_gate')

        if (!pinGate) {
            return NextResponse.json({ ok: false, error: 'PIN verification required', detail: 'Missing admin_gate cookie' }, { status: 403 })
        }

        const body = await request.json()
        const items = body.items
        const course_key = (body.course_key || '').trim() || null

        if (!Array.isArray(items)) {
            return NextResponse.json({ ok: false, error: 'Invalid input', detail: 'items must be an array' }, { status: 400 })
        }

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

        let insertedCount = 0
        let embeddedCount = 0
        let skippedCount = 0

        const validItems = []

        // 1. Validation Logic
        for (const item of items) {
            const question = (item.question || '').trim()
            const answer = (item.answer || '').trim()

            if (!question || !answer) {
                skippedCount++
                continue
            }

            if (question.length + answer.length < 80) {
                skippedCount++
                continue
            }

            validItems.push({
                source: item.source || 'manual',
                url: item.url || null,
                question,
                answer,
                course_key
            })
        }

        // 2. Batch Processing for Embeddings & Insertion
        const batchSize = 20
        for (let i = 0; i < validItems.length; i += batchSize) {
            const batch = validItems.slice(i, i + batchSize)

            // Generate Embeddings
            try {
                const response = await openai.embeddings.create({
                    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                    input: batch.map(item => item.question.replace(/\n/g, ' ') + " " + item.answer.replace(/\n/g, ' '))
                    // Best practice: embed combined Q+A or just Q depending on usage. 
                    // For Q&A retrieval, typically embedding Q is best for matching user Q, 
                    // BUT prompt says "query_embedding" (same as chunk). 
                    // Given use case "Q&A matches", we usually match user Question against DB Question.
                    // However, sometimes matching against Pair is better. 
                    // Re-reading request: "store into qna_pairs.embedding". 
                    // I will embed the QUESTION only, as that is what we search against typically for FAQ style.
                    // WAIT, the prompt in /api/ask uses Q+A in context.
                    // The typical pattern is embedding the question for retrieval.
                    // Let's stick to embedding the QUESTION for semantic similarity to the user's query.
                })

                // Use a separate call for just questions to align with standard FAQ retrieval
                const questionEmbeddingsResponse = await openai.embeddings.create({
                    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                    input: batch.map(item => item.question.replace(/\n/g, ' '))
                })

                const embeddings = questionEmbeddingsResponse.data

                const rowsToInsert = batch.map((item: any, idx) => ({
                    source: item.source,
                    url: item.url,
                    question: item.question,
                    answer: item.answer,
                    course_key: item.course_key,
                    embedding: embeddings[idx].embedding // embeddings is correctly indexed
                }))

                const { error: insertError } = await supabase
                    .from('qna_pairs')
                    .insert(rowsToInsert)

                if (insertError) {
                    console.error('Batch Insert Error:', insertError)
                    // If batch fails, we log and continue to next batch (or could throw)
                    // For now, we count as failures/skipped implicitly or just don't increment inserted
                } else {
                    insertedCount += rowsToInsert.length
                    embeddedCount += rowsToInsert.length
                }

            } catch (err) {
                console.error('Batch Embedding Error:', err)
            }
        }

        return NextResponse.json({
            ok: true,
            inserted: insertedCount,
            embedded: embeddedCount,
            skipped: skippedCount
        })

    } catch (error: any) {
        console.error('Import Q&A Error:', error)
        return NextResponse.json({
            ok: false,
            error: 'Internal server error',
            detail: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
