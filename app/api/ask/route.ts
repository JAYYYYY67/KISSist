import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

// Ensure Node.js runtime
export const runtime = 'nodejs'

export async function POST(request: Request) {
    // STRICT ENV VAR CHECK
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
        console.error('[Ask] OPENAI_API_KEY not found at runtime')
        return NextResponse.json({ ok: false, error: 'Missing OPENAI_API_KEY' }, { status: 500 })
    }

    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const question = body.question as string

        if (!question) {
            return NextResponse.json({ ok: false, error: 'Question is required' }, { status: 400 })
        }

        const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

        const courseKey = body.course_key as string | null
        let usedFallback = false

        // 1. Generate Embedding for Question
        const embeddingResponse = await openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
            input: question.replace(/\n/g, ' ')
        })

        const queryEmbedding = embeddingResponse.data[0].embedding

        if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1536 || !queryEmbedding.every(Number.isFinite)) {
            throw new Error('Invalid embedding format from OpenAI')
        }

        // Format as string for Postgres vector
        const vectorString = `[${queryEmbedding.map(v => v.toFixed(8)).join(',')}]`

        console.log('[Ask] embedding length', queryEmbedding.length)
        console.log('[Ask] vector preview', vectorString.slice(0, 60))

        // 1.5 Search TA Feedback
        let feedbackChunks: any[] = []
        let feedbackCount = 0
        let topFeedbackScore = 0

        console.log(`[Ask] Searching assistant_feedback with match_assistant_feedback RPC...`)

        const course_key_param = courseKey || null;
        const minSimilarity = Number(process.env.FEEDBACK_MIN_SIMILARITY) || 0.55;
        const params = {
            query_embedding: vectorString,
            match_count: 3,
            min_similarity: minSimilarity,
            course_key_param
        }

        const { data: fbData, error: fbError } = await supabase.rpc('match_assistant_feedback', params)

        console.log('[Ask] feedback rpc params:', params)
        console.log('[Ask] feedback rpc error:', fbError)
        console.log('[Ask] feedback rpc rows:', fbData?.length ?? 0)
        console.log('[Ask] feedback rpc top similarity:', fbData?.[0]?.similarity ?? null)

        let feedbackRpcError = fbError ? fbError.message : null;

        if (fbData && fbData.length > 0) {
            feedbackChunks = fbData
            feedbackCount = fbData.length
            topFeedbackScore = fbData[0].similarity
        }

        // 2. Search Textbook (Strict -> Loose)
        let textbookChunks: any[] = []
        let textbookMode = 'strict'

        // Build document map
        const { data: allDocs } = await supabase.from('documents').select('id, course_key, course_name, title');
        const docMap = new Map((allDocs || []).map(d => [d.id, d]));

        let validDocIds: string[] | null = null;
        if (courseKey) {
            validDocIds = (allDocs || [])
                .filter(d => d.course_key === courseKey)
                .map(d => d.id);

            const { count: chunkCount } = await supabase
                .from('chunks')
                .select('*', { count: 'exact', head: true })
                .in('document_id', validDocIds);

            console.log(`[Ask] courseKey=${courseKey} docs=${validDocIds.length} chunks=${chunkCount || 0}`);
        }

        // Helper to run search
        const runGlobalSearch = async () => {
            const { data: tbStrict } = await supabase.rpc('match_chunks_strict', {
                match_count: 8,
                query_embedding: vectorString,
                min_similarity: 0.62
            })
            if (tbStrict && tbStrict.length > 0) return { chunks: tbStrict, mode: 'strict' }

            const { data: tbLoose } = await supabase.rpc('match_chunks_loose', {
                match_count: 8,
                query_embedding: vectorString
            })
            return { chunks: tbLoose || [], mode: 'loose' }
        }

        const runCourseSearch = async (docIds: string[]) => {
            if (docIds.length === 0) return { chunks: [], mode: 'strict' };

            // Increase match_count significantly here to let the PostgREST .in filter catch matches
            // before the global limit starves the result set.
            const { data: tbStrict } = await supabase.rpc('match_chunks_strict', {
                match_count: 1000,
                query_embedding: vectorString,
                min_similarity: 0.62
            }).in('document_id', docIds)

            if (tbStrict && tbStrict.length > 0) return { chunks: tbStrict.slice(0, 8), mode: 'strict' }

            const { data: tbLoose } = await supabase.rpc('match_chunks_loose', {
                match_count: 1000,
                query_embedding: vectorString
            }).in('document_id', docIds)

            return { chunks: (tbLoose || []).slice(0, 8), mode: 'loose' }
        }

        if (courseKey) {
            const result = await runCourseSearch(validDocIds || [])
            if (result.chunks.length > 0) {
                textbookChunks = result.chunks
                textbookMode = result.mode
            }
        } else {
            const result = await runGlobalSearch()
            textbookChunks = result.chunks
            textbookMode = result.mode
        }

        // 3. Search Q&A (Strict -> Loose)
        let qnaChunks: any[] = []
        let qnaMode = 'strict'

        const runGlobalQna = async () => {
            const { data: qStrict } = await supabase.rpc('match_qna_strict', {
                match_count: 5,
                query_embedding: vectorString,
                min_similarity: 0.62
            })
            if (qStrict && qStrict.length > 0) return { chunks: qStrict, mode: 'strict' }

            const { data: qLoose } = await supabase.rpc('match_qna_loose', {
                match_count: 5,
                query_embedding: vectorString
            })
            return { chunks: qLoose || [], mode: 'loose' }
        }

        const qnaResult = await runGlobalQna()
        qnaChunks = qnaResult.chunks || []
        qnaMode = qnaResult.mode

        if (courseKey && textbookChunks.length === 0 && qnaChunks.length === 0) {
            console.log(`[Ask] courseKey=${courseKey} docIds=${validDocIds?.length || 0} matches=0`);
            console.log(`[Ask] Course '${courseKey}' yielded no results. Falling back to global search.`)
            usedFallback = true

            const tbResult = await runGlobalSearch()
            textbookChunks = tbResult.chunks || []
            textbookMode = tbResult.mode
        }

        console.log(`[Ask] TB=${textbookMode}(${textbookChunks.length}) Q&A=${qnaMode}(${qnaChunks.length})`)

        // 4. Determine Answer Policy (Hybrid)
        const STRONG_SCORE = 0.80;
        const topQnaScore = qnaChunks.length > 0 ? qnaChunks[0].similarity : 0;

        let qnaStrong = false;
        let answerPolicy = "HYBRID_GENERATIVE";

        if (feedbackChunks.length > 0) {
            answerPolicy = "TA_CONFIRMED";
        } else if ((qnaChunks.length >= 1 && topQnaScore >= STRONG_SCORE) || qnaChunks.length >= 2) {
            qnaStrong = true;
            answerPolicy = "QNA_STRONG";
        }

        // Build Context
        let contextText = ''
        const pageNumbers = new Set<number>()
        const references: any[] = []

        // TA Feedback Section
        let taFinalAnswer: string | null = null;
        if (feedbackChunks.length > 0) {
            taFinalAnswer = feedbackChunks[0].final_answer;
            contextText += '[TA EDITED ANSWERS CONTEXT]\n'
            contextText += feedbackChunks.map((f: any) => {
                return `(sim ${f.similarity.toFixed(4)}) Q: ${f.question}\nTA_EDITED_ANSWER: ${f.final_answer}`
            }).join('\n\n') + '\n\n'
        }

        // Textbook Section
        if (textbookChunks.length > 0) {
            contextText += '[TEXTBOOK CONTEXT]\n'
            const pageMap = new Map<string, any>();

            textbookChunks.forEach((c: any) => {
                const docInfo: any = docMap.get(c.document_id) || {}
                const pageKey = `${c.document_id}-${c.page_number}`

                let cleanContent = (c.content || '').replace(/\s+/g, ' ').trim();
                let isMeaningful = cleanContent.length > 20 && !cleanContent.toUpperCase().startsWith('KISS LOGIC') && !cleanContent.toUpperCase().startsWith('KISSCHEMA');

                if (!pageMap.has(pageKey)) {
                    pageMap.set(pageKey, { chunk: c, docInfo, content: isMeaningful ? cleanContent : '' });
                } else {
                    const existing = pageMap.get(pageKey);
                    if (!existing.content && isMeaningful) {
                        existing.content = cleanContent;
                    }
                }

                pageNumbers.add(c.page_number)
                contextText += `[Page ${c.page_number}] (sim ${c.similarity.toFixed(4)}): ${c.content}\n\n`
            });

            for (const { chunk: c, docInfo, content } of pageMap.values()) {
                let highlightText = '';
                if (content) {
                    let snippet = content.slice(0, 90);
                    const lastSpace = snippet.lastIndexOf(' ');
                    if (lastSpace > 60) snippet = snippet.slice(0, lastSpace);
                    highlightText = snippet + (content.length > 90 ? '...' : '');
                } else {
                    highlightText = (c.content || '').replace(/\s+/g, ' ').slice(0, 40) + '...';
                }

                references.push({
                    courseKey: docInfo.course_key || null,
                    courseName: docInfo.course_name || 'All Courses',
                    documentTitle: docInfo.title || 'Unknown Document',
                    documentId: c.document_id,
                    page: c.page_number,
                    similarity: c.similarity,
                    highlightText
                })
            }
        }

        // Q&A Section
        if (qnaChunks.length > 0) {
            contextText += '[PAST Q&A CONTEXT]\n'
            contextText += qnaChunks.map((q: any) => {
                // If QnA has page numbers stored somewhere already, keep using them
                if (q.page_number !== undefined && q.page_number !== null) {
                    pageNumbers.add(q.page_number)
                } else if (q.page !== undefined && q.page !== null) {
                    pageNumbers.add(q.page)
                }
                return `(sim ${q.similarity.toFixed(4)}) Q: ${q.question}\nA: ${q.answer}\nURL: ${q.url || ''}`
            }).join('\n\n')
        }

        if (!contextText) contextText = 'No relevant materials found.'

        // 5. Chat Completion (STRICT PROMPT)
        let policyPrompt = '';

        if (answerPolicy === "TA_CONFIRMED") {
            policyPrompt = `- This query matches a previously verified and edited answer from a TA.
- You MUST heavily rely on the TA_EDITED_ANSWER provided in the context.
- Adapt the TA_EDITED_ANSWER exactly into the required format (자세한 설명).
- DO NOT delete or distort the content of the TA_EDITED_ANSWER. 
- You MUST include the core sentences and any added intent from the TA_EDITED_ANSWER verbatim or in highly accurate paraphrasing.
- If QnA or 교재 concepts conflict with the TA_EDITED_ANSWER, the TA's answer takes absolute precedence.`;
        } else if (answerPolicy === "QNA_STRONG") {
            policyPrompt = `- The answer must be grounded primarily in the top 1–3 QnA answers.
- Do NOT copy-paste the QnA verbatim as a single chunk.
- Organize the "자세한 설명" into 5–6 paragraphs.
- Add small clarifications/examples ONLY if consistent with the QnA.
- If the user's question is slightly different, explicitly map the "질문 의도" (intent) to the QnA's intent in paragraph 1 of the detailed explanation section.`;
        } else {
            policyPrompt = `- Use any available textbook snippets. If none are available, rely on the QnA and general explanation based on provided materials.
- Keep EXACTLY 5–6 paragraphs for the "자세한 설명" section.
- Use a "teaching-style" tone: define the concept, explain it clearly, show 1 short example, and mention a common pitfall.`;
        }

        const systemPrompt = `You are an assistant answering based ONLY on provided materials. Answer in Korean.

STRICT FORMATTING RULES:
- The output MUST exactly consist of the following structure:
  1. A greeting at the very beginning exactly matching: "안녕하세요! KISS 연구소 입니다."
  2. A detailed explanation of 5-6 paragraphs (each 2-3 sentences).
  3. A closing statement at the very end exactly matching: "질문에 대한 좋은 답변이 되었길 바랍니다! 추가로 궁금하신 점이 있다면 언제든 Q&A 게시판을 이용해주세요!"
- Tone: 밝고 에너지 넘치게 다정하고 친근한 조교님 말투('~해요!', '~습니다!'체)로 작성해주세요. 단 한 명의 학생에게 1:1로 직접 답변하는 상황이므로 '여러분' 같은 다수 지칭 표현은 절대 쓰지 마세요 (상대방을 칭할 때 '학생', '학생분', '질문자님' 등으로 통일하세요). 느낌표(!)를 적절히 섞어 활기찬 느낌을 살리되 이모지는 이모티콘은 사용하지 마세요. 친근함 80%, 진지함 20% 정도로 작성해주세요. Keep the explanation structured but conversational (no generic bullet lists by default).
- Do NOT explicitly mention page numbers in the text of your answer.
- Textbook content is the PRIMARY source of truth, but follow the specific policy rules below based on context strength.

POLICY RULES (${answerPolicy}):
${policyPrompt}

CONTEXT:
${contextText}`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question }
            ],
            temperature: 0.1,
        })

        let answer = completion.choices[0].message.content || ''
        let referencesPages = Array.from(pageNumbers).sort((a, b) => a - b)

        const topTextbookScore = textbookChunks.length > 0 ? textbookChunks[0].similarity : 0;
        let lowConfidence = (topTextbookScore < 0.62) && (topQnaScore < 0.55);

        if (topTextbookScore >= 0.65) {
            lowConfidence = false;
        }

        if (lowConfidence) {
            referencesPages = []
            references.length = 0 // Clear references as well
        }

        return NextResponse.json({
            apiVersion: "ask-v2-dual",
            lowConfidence,
            taFinalAnswer,
            answer,
            referencesPages,
            references,
            retrieval: {
                textbookMode,
                qnaMode,
                usedFallback,
                selectedCourseKey: courseKey || null
            },
            matches: textbookChunks.map((c: any) => ({
                page: c.page_number,
                similarity: c.similarity
            })),
            debug: {
                answerPolicy,
                qnaCount: qnaChunks.length,
                topQnaScore,
                feedbackCount,
                topFeedbackScore,
                ...(feedbackRpcError ? { feedbackRpcError } : {}),
                retrievalScope: courseKey ? "course_plus_null" : "global"
            }
        })

    } catch (error: any) {
        console.error('[Ask] Error:', error)
        return NextResponse.json({
            ok: false,
            error: 'Internal server error',
            detail: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
