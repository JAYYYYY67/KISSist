// Removed invalid Next.js config warning

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import OpenAI from 'openai'

// Configure worker for Node environment
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'

// Ensure Node.js runtime for pdfjs
export const runtime = 'nodejs'

export async function POST(request: Request) {
    // STRICT ENV VAR CHECK AT START
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
        console.error('[IndexPDF] OPENAI_API_KEY not found at runtime')
        return NextResponse.json({ ok: false, error: 'Missing OPENAI_API_KEY' }, { status: 500 })
    }

    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            console.log('[IndexPDF] Auth user email: none')
            return NextResponse.json({ ok: false, error: 'Unauthorized', detail: 'No session user' }, { status: 401 })
        }

        const adminEmail = process.env.ADMIN_EMAIL
        const isAdmin = !!adminEmail && user.email === adminEmail

        if (!isAdmin) {
            console.log(`[IndexPDF] Auth user email: ${user.email}`)
            console.log(`[IndexPDF] Admin check failed. Expected: ${adminEmail}, Got: ${user.email}`)
            return NextResponse.json({ ok: false, error: 'Forbidden', detail: 'Email mismatch' }, { status: 403 })
        }

        // Check for admin_gate cookie
        const cookieStore = await cookies()
        const pinGate = cookieStore.get('admin_gate')

        if (!pinGate) {
            console.log(`[IndexPDF] Auth user email: ${user.email}`)
            console.log('[IndexPDF] Admin gate cookie missing')
            return NextResponse.json({ ok: false, error: 'PIN verification required', detail: 'Missing admin_gate cookie' }, { status: 403 })
        }

        console.log(`[IndexPDF] Auth checks passed. User: ${user.email}`)

        console.log('[IndexPDF] Waiting for formData parse (Testing large body size up to 50MB)...')
        const formData = await request.formData()
        console.log(`[IndexPDF] request.formData() parsed successfully. Checking fields...`)

        const title = formData.get('title') as string
        const courseKey = formData.get('courseKey') as string
        const courseName = formData.get('courseName') as string || null
        const file = formData.get('file') as File

        if (file) console.log(`[IndexPDF] Received file: ${file.name}, size: ${Math.round(file.size / 1024 / 1024 * 10) / 10}MB`)

        if (!file || !title || !courseKey) {
            return NextResponse.json({ ok: false, error: 'Missing title, courseKey, or file' }, { status: 400 })
        }

        // Sanitize filename
        const sanitizedName = file.name.toLowerCase().replace(/[^a-z0-9.]/g, '-')
        const timestamp = Date.now()
        const storagePath = `materials/${timestamp}-${sanitizedName}`

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from('materials')
            .upload(storagePath, file)

        if (uploadError) {
            console.error('Storage Upload Error:', uploadError)
            return NextResponse.json({ ok: false, error: 'Failed to upload file: ' + uploadError.message }, { status: 500 })
        }

        // Insert into DB (documents)
        const { data: docData, error: dbError } = await supabase
            .from('documents')
            .insert({
                title: title,
                file_name: storagePath,
                course_key: courseKey,
                course_name: courseName
            })
            .select()
            .single()

        if (dbError) {
            console.error('DB Insert Error:', dbError)
            return NextResponse.json({ ok: false, error: 'Failed to save document record: ' + dbError.message }, { status: 500 })
        }

        // --- CHUNKING LOGIC ---

        // 1. Download file buffer
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('materials')
            .download(storagePath)

        if (downloadError || !fileData) {
            console.error('Download Error:', downloadError)
            return NextResponse.json({
                ok: true,
                documentId: docData.id,
                storagePath,
                error: 'Document saved but failed to download for chunking'
            })
        }

        const arrayBuffer = await fileData.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)

        // 2. Load PDF
        const loadingTask = pdfjsLib.getDocument({
            data: uint8Array,
            useSystemFonts: true,
        })

        const pdfDocument = await loadingTask.promise
        const pagesTotal = pdfDocument.numPages

        let chunkCount = 0
        const chunksPerPageSummary: { page: number, chunks: number }[] = []


        // 3. Extract Text Page by Page
        for (let i = 1; i <= pagesTotal; i++) {
            const page = await pdfDocument.getPage(i)
            const textContent = await page.getTextContent()
            const strings = textContent.items.map((item: any) => item.str)
            const text = strings.join(' ').trim()

            if (text.length > 0) {
                // 1) Normalize whitespace
                const normalized = text.replace(/\s+/g, ' ').trim()

                // 2) Split into sentences (EN: .!? | KR: 다. 요. 니다.)
                const sentences = normalized
                    .split(/(?<=[\.!\?])\s+|(?<=다\.)\s+|(?<=요\.)\s+|(?<=니다\.)\s+/)
                    .map(s => s.trim())
                    .filter(s => s.length > 0)

                // 3) Merge into semanticChunks (Target: 450, Max: 750)
                let semanticChunks: string[] = []
                let tempChunk = ""

                const pushChunk = (c: string) => {
                    if (c.trim().length > 0) semanticChunks.push(c.trim())
                }

                for (const sentence of sentences) {
                    // Handle massive sentences > 750 chars by force-slicing
                    if (sentence.length > 750) {
                        if (tempChunk.length > 0) {
                            pushChunk(tempChunk)
                            tempChunk = ""
                        }
                        let i = 0
                        while (i < sentence.length) {
                            pushChunk(sentence.slice(i, i + 450))
                            i += 450
                        }
                        continue
                    }

                    // Normal merging (Target ~450, Strict limit 750)
                    if (tempChunk.length + sentence.length + 1 > 750) {
                        if (tempChunk.length > 0) {
                            pushChunk(tempChunk)
                            tempChunk = sentence
                        } else {
                            pushChunk(sentence)
                            tempChunk = ""
                        }
                    } else {
                        // Accumulate
                        if (tempChunk.length > 0) {
                            tempChunk += " " + sentence
                        } else {
                            tempChunk = sentence
                        }
                    }
                }
                if (tempChunk.length > 0) pushChunk(tempChunk)

                // 4) Aggressive Fallback: If 1 big chunk and fails to split
                if (semanticChunks.length === 1 && normalized.length >= 600) {
                    // Force slice into 450-char chunks
                    semanticChunks = [] // Reset
                    for (let i = 0; i < normalized.length; i += 450) {
                        semanticChunks.push(normalized.slice(i, i + 450))
                    }
                }

                // 5) Insert Chunks
                for (const chunkContent of semanticChunks) {
                    const { error: chunkError } = await supabase
                        .from('chunks')
                        .insert({
                            document_id: docData.id,
                            page_number: i,
                            content: chunkContent
                        })

                    if (!chunkError) {
                        chunkCount++
                    } else {
                        console.error(`Chunk Insert Error (Page ${i}):`, chunkError)
                    }
                }

                // 6) Log & Summary
                console.log(`[Chunking] page ${i} len ${normalized.length} sentences ${sentences.length} chunks ${semanticChunks.length}`)
                chunksPerPageSummary.push({ page: i, chunks: semanticChunks.length })
            }
        }

        // --- EMBEDDING LOGIC ---
        // Strictly Fetch -> Embed -> Update

        console.log('[IndexPDF] Embedding start')

        let chunksEmbedded = 0
        const failedChunkIds: string[] = []
        let totalChunksFetched = 0

        const DB_BATCH_SIZE = 250 // Recommended 200~300 for free tier / 502 avoidance
        let lastId: string | null = null // Cursor pagination
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

        while (true) {
            // 1. Fetch chunks from DB (only those without embeddings, paginated by cursor)
            let query = supabase
                .from('chunks')
                .select('id, content')
                .eq('document_id', docData.id)
                .is('embedding', null)
                .order('id', { ascending: true })
                .limit(DB_BATCH_SIZE)

            if (lastId) {
                query = query.gt('id', lastId)
            }

            const { data: chunksToEmbed, error: fetchError } = await query

            if (fetchError) {
                console.error('[IndexPDF] Failed to fetch chunks for embedding:', fetchError)
                throw new Error('Failed to fetch chunks for embedding: ' + fetchError.message)
            }

            if (!chunksToEmbed || chunksToEmbed.length === 0) {
                break // No more null chunks to process
            }

            // Update cursor to the last fetched chunk's ID
            lastId = chunksToEmbed[chunksToEmbed.length - 1].id

            totalChunksFetched += chunksToEmbed.length

            // Filter valid chunks
            const validChunks = chunksToEmbed.filter(c => c.content.length >= 20)
            console.log(`[IndexPDF] Fetched DB batch of ${chunksToEmbed.length}. Processing ${validChunks.length} valid chunks. Cursor (lastId): ${lastId}`)

            if (validChunks.length > 0) {
                const OPENAI_BATCH_SIZE = 25
                const totalBatches = Math.ceil(validChunks.length / OPENAI_BATCH_SIZE)

                for (let i = 0; i < validChunks.length; i += OPENAI_BATCH_SIZE) {
                    const batchNumber = Math.floor(i / OPENAI_BATCH_SIZE) + 1
                    console.log(`[IndexPDF] Embedding OpenAI batch ${batchNumber}/${totalBatches}`)

                    const batch = validChunks.slice(i, i + OPENAI_BATCH_SIZE)

                    try {
                        // Call OpenAI
                        const response = await openai.embeddings.create({
                            model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                            input: batch.map(c => c.content.replace(/\n/g, ' '))
                        })

                        const embeddings = response.data

                        // Update chunks with retry + backoff
                        for (let j = 0; j < batch.length; j++) {
                            const chunkId = batch[j].id
                            const embeddingVector = embeddings[j].embedding
                            let success = false;

                            const maxRetries = 3;
                            const backoffs = [500, 1000, 2000, 4000]; // ms
                            let attempt = 0;

                            while (!success && attempt <= maxRetries) {
                                if (attempt > 0) {
                                    const delay = backoffs[attempt - 1] || 4000;
                                    await new Promise(res => setTimeout(res, delay));
                                }

                                const { error: updateError } = await supabase
                                    .from('chunks')
                                    .update({ embedding: embeddingVector })
                                    .eq('id', chunkId)

                                if (!updateError) {
                                    success = true;
                                    chunksEmbedded++;
                                } else {
                                    attempt++;
                                    if (attempt > maxRetries) {
                                        const status = (updateError as any).code || 'Unknown';
                                        console.error(`[IndexPDF] ❌ Update FAIL chunk ${chunkId} | Status: ${status} | Msg: ${updateError.message}`);
                                        failedChunkIds.push(chunkId);
                                    } else {
                                        console.warn(`[IndexPDF] ⚠️ Update retry ${attempt}/${maxRetries} chunk ${chunkId} | Msg: ${updateError.message}`);
                                    }
                                }
                            }
                        }

                    } catch (error: any) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        console.error(`[IndexPDF] ❌ Batch Embedding Logic Error: ${batch.length} chunks failed | Msg: ${errorMsg}`);
                        // Instead of throwing and failing the API, record all chunks in this batch as failed.
                        failedChunkIds.push(...batch.map(c => c.id));
                    }
                }
            }

            // Delete invalid chunks to keep DB clean
            const invalidChunks = chunksToEmbed.filter(c => c.content.length < 20)
            if (invalidChunks.length > 0) {
                console.log(`[IndexPDF] Skipping ${invalidChunks.length} chunks with length < 20. Deleting them from DB.`)
                const { error: delErr } = await supabase.from('chunks').delete().in('id', invalidChunks.map(c => c.id))
                if (delErr) console.error('[IndexPDF] Error deleting invalid chunks:', delErr)
            }
        }

        // Final verification check
        const { count: remainingCount, error: countErr } = await supabase
            .from('chunks')
            .select('*', { count: 'exact', head: true })
            .eq('document_id', docData.id)
            .is('embedding', null)

        if (remainingCount && remainingCount > 0) {
            console.warn(`[IndexPDF] ⚠️ WARNING: ${remainingCount} chunks still have null embeddings after processing!`);
        } else {
            console.log(`[IndexPDF] Embedding done. Embedded: ${chunksEmbedded}, Failed: ${failedChunkIds.length}. Final remaining null embeddings: ${remainingCount || 0}`)
        }

        return NextResponse.json({
            ok: true,
            documentId: docData.id,
            storagePath: storagePath,
            pagesTotal,
            chunksInserted: chunkCount,
            chunksTotal: totalChunksFetched,
            chunksEmbedded,
            chunksFailed: failedChunkIds.length,
            failedChunkIds,
            remainingAfter: remainingCount || 0,
            chunksPerPageSummary
        })

    } catch (error: any) {
        console.error('Index PDF Error:', error)
        // Return 500 but also include error detail
        return NextResponse.json({
            ok: false,
            error: 'Internal server error',
            detail: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
