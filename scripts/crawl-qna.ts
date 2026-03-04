/**
 * Q&A Crawler Script using Playwright
 * 
 * Usage:
 * 1. Install dependencies: npm install -D playwright ts-node
 * 2. Configure SELECTORS object below for your target site.
 * 3. Run: npx ts-node scripts/crawl-qna.ts
 */

import 'dotenv/config'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Load env vars
dotenv.config({ path: '.env.local' })

const DB_UPSERT_ONLY = process.env.DB_UPSERT_ONLY === '1'

// --- CONFIGURATION START ---
const CONFIG = {
    startUrls: [
        'https://tzone.mimacstudy.com/admin/tzone/tzoneStudyQnaList.ds'
    ],
    // Limit how many items to scrape globally
    maxItems: parseInt(process.env.MAX_ITEMS || '200000', 10),
    // Limit how many pages to crawl per slice
    maxPages: parseInt(process.env.MAX_PAGES || '9999', 10),
    // Limit how many items to scrape per slice
    sliceMaxItems: parseInt(process.env.SLICE_MAX_ITEMS || '200000', 10),
    // Delay between actions (ms)
    delayMs: 1000,
    // Enable debug logging and screenshots
    debug: true,

    // Login Configuration
    login: {
        loginUrl: "https://tzone.mimacstudy.com/admin/member/login.ds?",
        usernameSelector: '#userId',
        passwordSelector: '#userPwd',
        submitSelector: '#btnLogin',
        postLoginUrlNotContains: "/admin/member/login.ds"
    },

    selectors: {
        // Updated: stable selector for list items
        listLink: "a[name='linkBTitle'][bno]",

        // Selector for the 'Next' page button in pagination
        nextBtn: 'p.pagnation button.btn_next',
        paginationRoot: 'p.pagnation',

        // Detail page selectors
        question: '#QnaBoardDiv',
        answer: '#articleContent1_NOTMINE',

        // Search filters
        dateFrom: "#inputsearchStartDt",
        dateTo: "#inputsearchEndDt",
        searchBtn: "#btnSearch",

        // Lecture Name Extraction
        lectureContainer: "#bbsWriteVO",
        lectureNameFallback: "#bbsWriteVO > table:nth-child(12) > tbody > tr:nth-child(3) > td:nth-child(2) > p",

        // Empty state detection
        emptyState: "table.databoard tbody tr td[colspan]"
    },

    courseKeyMap: {
        // Example: "Course Name": "Key"
    } as Record<string, string>,

    filter: {
        from: "2025-12-01",
        to: new Date().toISOString().split('T')[0] // Dynamically set to today
    },

    // Output file path
    outputFile: 'output/qna.json'
}
// --- CONFIGURATION END ---

interface QnaItem {
    source: string
    url: string
    question: string
    answer: string
    // Optional meta fields for debugging
    bno?: string
    title?: string
    lecture_name?: string
    course_key?: string | null
}

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return ''
    return text.replace(/\s+/g, ' ').trim()
}

async function pickText(page: Page, selectors: string[]): Promise<string> {
    for (const sel of selectors) {
        const loc = page.locator(sel).first()
        if (await loc.count() === 0) continue
        const t = normalizeText(await loc.innerText().catch(() => ''))
        if (t.length > 0) return t
    }
    return ''
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function withRetry<T>(fn: () => Promise<T>, retries = 5, baseDelay = 1000): Promise<T> {
    let attempt = 0
    while (true) {
        try {
            return await fn()
        } catch (error) {
            attempt++
            if (attempt >= retries) throw error
            const waitTime = baseDelay * Math.pow(2, attempt - 1)
            console.warn(`[Retry] Attempt ${attempt} failed. Retrying in ${waitTime}ms... Error: ${(error as any).message}`)
            await delay(waitTime)
        }
    }
}

async function performLogin(page: Page) {
    if (!CONFIG.login) return

    console.log('🔑 Attempting to log in...')
    const adminUser = process.env.ADMIN_USER
    const adminPass = process.env.ADMIN_PASS

    if (!adminUser || !adminPass) {
        console.error('❌ Missing credentials! Please set ADMIN_USER and ADMIN_PASS environment variables.')
        throw new Error('Missing credentials')
    }

    try {
        await page.goto(CONFIG.login.loginUrl)

        // Wait for login form
        await page.waitForSelector(CONFIG.login.usernameSelector, { state: 'visible', timeout: 10000 })

        // Fill credentials
        await page.fill(CONFIG.login.usernameSelector, adminUser)
        await page.fill(CONFIG.login.passwordSelector, adminPass)

        // Click submit
        console.log('Clicking login implementation...')
        await Promise.all([
            page.click(CONFIG.login.submitSelector),
            // Wait for navigation and verify URL does not contain login path
            // We use networkidle to ensure redirects (like loginProgress.ds) finish
            page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { })
        ])

        // Additional settling wait
        console.log('Login clicked. Waiting for settling...')
        try {
            await page.waitForURL((url) => !url.toString().includes(CONFIG.login.postLoginUrlNotContains), { timeout: 20000 })
        } catch (e) {
            console.warn('Timeout waiting for URL to change from login. Continuing to check state...')
        }

        // Ensure login form is gone
        if (await page.locator(CONFIG.login.usernameSelector).count() > 0) {
            console.log('Login form input still detected. Waiting for it to disappear...')
            try {
                await page.waitForSelector(CONFIG.login.usernameSelector, { state: 'hidden', timeout: 5000 })
            } catch (e) {
                console.warn('Login form still visible? proceed with caution.')
            }
        }

        console.log('Verifying login...')
        const currentUrl = page.url()
        console.log(`Current URL after login: ${currentUrl}`)

        if (currentUrl.includes(CONFIG.login.postLoginUrlNotContains)) {
            throw new Error('Still on login page after submit')
        }

        console.log('✅ Login sequence finished.')

    } catch (loginError) {
        console.error('❌ Login failed:', loginError)
        if (CONFIG.debug) {
            const outDir = path.dirname(path.resolve(CONFIG.outputFile))
            const screenshotPath = path.join(outDir, `debug_login_fail_${Date.now()}.png`)
            await page.screenshot({ path: screenshotPath })
            console.log(`Saved screenshot to ${screenshotPath}`)
        }
        throw loginError
    }
}

const getToday = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })

const subtractDays = (dateStr: string, days: number): string => {
    const d = new Date(dateStr)
    d.setDate(d.getDate() - days)
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

const addDays = (dateStr: string, days: number): string => {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

const isBeforeOrSame = (d1: string, d2: string): boolean => {
    return new Date(d1) <= new Date(d2)
}

async function getCurrPage(page: Page) {
    const v = await page.locator('#currPage').inputValue().catch(() => '1')
    return parseInt(v, 10) || 1
}

async function clickPageNumber(page: Page, targetPageNumber: number): Promise<boolean> {
    const linkSelector = `p.pagnation a[href="javascript:pageMove(${targetPageNumber})"]`
    const nextBtnSelector = 'p.pagnation button.btn_next'

    for (let attempt = 1; attempt <= 3; attempt++) {
        // 1. Try exact number link
        const link = page.locator(linkSelector).first()
        if (await link.count() > 0) {
            try {
                await Promise.all([
                    page.waitForLoadState('load'),
                    link.click()
                ])
                await page.waitForSelector(CONFIG.selectors.listLink, { state: 'attached', timeout: 15000 })
                return true
            } catch (e) {
                console.warn(`[PAGING] Click target ${targetPageNumber} failed (attempt ${attempt})`, e)
            }
        }

        // 2. If not found, try next button (only if we haven't found the link)
        // Check if next button exists
        const nextBtn = page.locator(nextBtnSelector).first()
        if (await nextBtn.count() > 0) {
            console.log(`[PAGING] Target ${targetPageNumber} not visible. Clicking next block button...`)
            try {
                await Promise.all([
                    page.waitForLoadState('load'),
                    nextBtn.click()
                ])
                await page.waitForSelector(CONFIG.selectors.listLink, { state: 'attached', timeout: 15000 })
                // After advancing block, loop again to find target link
                continue
            } catch (e) {
                console.warn(`[PAGING] Click next button failed (attempt ${attempt})`, e)
            }
        } else {
            // No link and no next button -> End of pagination
            return false
        }
    }

    return false
}

async function gotoListPage(page: Page, targetPage: number) {
    const prevFirstBno = await page.locator(CONFIG.selectors.listLink).first().getAttribute('bno').catch(() => null)

    // Attempt navigation via UI
    const moved = await clickPageNumber(page, targetPage)

    if (!moved) {
        throw new Error(`Could not navigate to page ${targetPage} (link/button not found after retries)`)
    }

    // Wait until #currPage matches target (server may set it)
    const ok = await page.waitForFunction((n) => {
        const el = document.querySelector('#currPage') as HTMLInputElement | null
        return el && String(el.value) === String(n)
    }, targetPage, { timeout: 20000 }).then(() => true).catch(() => false)

    if (!ok) {
        const outDir = path.dirname(path.resolve(CONFIG.outputFile))
        const ts = Date.now()
        const screenshotPath = path.join(outDir, `debug_pageMove_fail_target${targetPage}_${ts}.png`)
        await page.screenshot({ path: screenshotPath }).catch(() => { })
        if (CONFIG.debug) {
            const htmlPath = path.join(outDir, `debug_pageMove_fail_target${targetPage}_${ts}.html`)
            try { fs.writeFileSync(htmlPath, await page.content()) } catch (e) { }
        }
        throw new Error(`pageMove(${targetPage}) failed: #currPage did not update to ${targetPage}`)
    }

    // Wait list selector again
    await page.waitForSelector(CONFIG.selectors.listLink, { state: 'attached', timeout: 20000 })

    // Wait until list refreshes (first bno changed OR at least stable for 1s)
    await page.waitForFunction(([sel, prev]) => {
        const a = document.querySelector(sel) as HTMLElement | null
        const bno = a?.getAttribute('bno')
        return !!bno && bno !== prev
    }, [CONFIG.selectors.listLink, prevFirstBno] as const, { timeout: 20000 })
        .catch(() => console.warn(`[WARN] list bno didn't change after pageMove(${targetPage})`))
}

async function assertListReady(page: Page, reason: string) {
    console.log(`[LIST_READY] reason=${reason} url=${page.url()}`)
    const curr = await page.locator('#currPage').inputValue().catch(() => '')
    console.log(`[LIST_READY] #currPage=${curr}`)
    // list selector must exist
    // list selector must exist
    await page.waitForSelector(CONFIG.selectors.listLink, { state: 'attached', timeout: 20000 })
    // also print first bno for refresh detection
    const firstBno = await page.locator(CONFIG.selectors.listLink).first().getAttribute('bno').catch(() => '')
    console.log(`[LIST_READY] firstBno=${firstBno}`)
}

async function applyListFilters(page: Page, fromDate: string, toDate: string, statusValue: string = '02') {
    console.log(`🔍 Applying search filters: ${fromDate} ~ ${toDate}, status=${statusValue}`)

    // 1) & 2) Wait for selectors
    try {
        await page.waitForSelector('#inputsearchStartDt', { state: 'visible', timeout: 15000 })
        await page.waitForSelector('#inputsearchEndDt', { state: 'visible', timeout: 15000 })
    } catch (e) {
        console.warn('Filter selectors not found. Skipping filter application.')
        return
    }

    // Parse input yyyy-MM-dd to Date objects
    const dFrom = new Date(fromDate)
    const dTo = new Date(toDate)
    // Format to yyyy/MM/dd for underlying input value
    const toSlash = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}/${m}/${day}`
    }
    const startYYYYMMDD = toSlash(dFrom)
    const endYYYYMMDD = toSlash(dTo)

    console.log(`Setting date range: ${startYYYYMMDD} ~ ${endYYYYMMDD}`)

    // 3) Clear & fill (no dispatchEvent)
    await page.locator('#inputsearchStartDt').fill('')
    await page.locator('#inputsearchStartDt').fill(startYYYYMMDD)
    await page.locator('#inputsearchEndDt').fill('')
    await page.locator('#inputsearchEndDt').fill(endYYYYMMDD)

    // 4) Precheck readback
    const s = await page.locator('#inputsearchStartDt').inputValue().catch(() => '')
    const e = await page.locator('#inputsearchEndDt').inputValue().catch(() => '')
    console.log(`[FILTER_PRECHECK] start=${s}, end=${e}`)

    // 5) Keep existing status-select logic
    console.log('Resolving answer status select...')
    const selectLocators = page.locator('#frm select')
    const count = await selectLocators.count()
    let targetSelectIndex = -1

    for (let i = 0; i < count; i++) {
        const optionsText = await selectLocators.nth(i).textContent() || ''
        let matches = 0
        if (optionsText.includes('상태전체')) matches++
        if (optionsText.includes('대기중')) matches++
        if (optionsText.includes('답변 완료')) matches++

        if (matches >= 2) {
            targetSelectIndex = i
            break
        }
    }

    if (targetSelectIndex !== -1) {
        const targetSelect = selectLocators.nth(targetSelectIndex)
        try {
            await targetSelect.selectOption({ value: statusValue }).catch(async () => {
                await targetSelect.selectOption({ label: '답변 완료' })
            })
            if (CONFIG.debug) console.log(`Selected status "${statusValue}"`)
        } catch (err) {
            console.warn('Could not select status option', err)
        }
    } else {
        console.warn('Could not identify status select element.')
    }

    // 6) Submit search WITHOUT using evaluate
    console.log('Submitting search via #btnSearch...')
    await page.locator('#btnSearch').click()
    await page.waitForLoadState('load')

    // Ensure list is attached again
    try {
        await page.waitForSelector(CONFIG.selectors.listLink, { state: 'attached', timeout: 10000 })
    } catch (err) {
        console.log('List might be empty after filter.')
    }

    // 7) After submit, do FILTER_CHECK reading the same two inputs + status value again
    const postStart = await page.locator('#inputsearchStartDt').inputValue().catch(() => '')
    const postEnd = await page.locator('#inputsearchEndDt').inputValue().catch(() => '')
    const statusVal = await page.locator('select[name="searchQnaStatus"]').inputValue().catch(() => '')

    console.log(`[FILTER_CHECK] start=${postStart}, end=${postEnd}, status=${statusVal}`)

    const startOk = postStart === startYYYYMMDD || postStart === fromDate
    const endOk = postEnd === endYYYYMMDD || postEnd === toDate
    // status check is loose as selectors vary

    if (!startOk || !endOk) {
        console.warn(`[FILTER_CHECK] Mismatch! Expected ${startYYYYMMDD}~${endYYYYMMDD}, got ${postStart}~${postEnd}`)
        if (CONFIG.debug) {
            const outDir = path.dirname(path.resolve(CONFIG.outputFile))
            const screenshotPath = path.join(outDir, `filter_check_fail_${Date.now()}.png`)
            await page.screenshot({ path: screenshotPath }).catch(() => { })
            if (CONFIG.debug) {
                const htmlPath = path.join(outDir, `filter_check_fail_${Date.now()}.html`)
                try { fs.writeFileSync(htmlPath, await page.content()) } catch (e) { }
            }
        }
        throw new Error('Filter pre-check failed')
    }
}

async function restoreListState(page: Page, listUrl: string, fromDate: string, toDate: string, statusValue: string, pageNum: number) {
    console.log(`[RESTORE_STATE] Recovering list state: Page ${pageNum}`)
    await page.goto(listUrl, { waitUntil: 'load' })
    await applyListFilters(page, fromDate, toDate, statusValue)
    if (pageNum > 1) {
        await gotoListPage(page, pageNum)
    }
    await assertListReady(page, `restore page=${pageNum}`)
}

async function run() {
    console.log('🚀 Starting Crawler...')

    // Runtime validation of env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
        console.error('❌ Missing required environment variables for DB/AI.')
        console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY')
        process.exit(1)
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    })

    let items: QnaItem[] = []
    let browser: any = null // Declare browser here to make it accessible to finally block

    // --- DB_EMBED_NULLS MODE ---
    if (process.env.DB_EMBED_NULLS === '1') {
        console.log('\n[MODE] DB_EMBED_NULLS: Filling missing embeddings directly from DB...')

        while (true) {
            // a) Query 50 missing rows
            const fetchMissing = async (retries = 3) => {
                for (let attempt = 1; attempt <= retries; attempt++) {
                    const { data, error } = await supabase
                        .from('qna_pairs')
                        .select('id, question, answer')
                        .is('embedding', null)
                        .not('question', 'is', null)
                        .not('answer', 'is', null)
                        .limit(50)

                    if (!error) return { data, error: null }

                    console.warn(`[WARN] DB_EMBED_NULLS fetch failed (attempt ${attempt}): ${error.message}`)
                    if (attempt < retries) await delay(Math.pow(2, attempt - 1) * 1000)
                    else return { data: null, error }
                }
                return { data: null, error: new Error('Max retries') }
            }

            const { data: rows, error } = await fetchMissing(3)
            if (error) {
                console.error('❌ Fatal error fetching missing DB rows:', error.message)
                break
            }

            const itemsToEmbed = rows || []
            console.log(`[DB_EMBED_NULLS] fetched=${itemsToEmbed.length}`)

            // b) Exit if done
            if (itemsToEmbed.length === 0) {
                console.log('[DB_EMBED_NULLS] done')
                break
            }

            // c) Generate embeddings
            const textsToEmbed = itemsToEmbed.map(r => `${r.question}\n\n${r.answer}`)
            let newEmbeddings: number[][] = []

            try {
                await withRetry(async () => {
                    const resp = await openai.embeddings.create({
                        model: 'text-embedding-3-small',
                        input: textsToEmbed
                    })
                    newEmbeddings = resp.data.map(d => d.embedding)
                })
            } catch (embedErr: any) {
                console.error(`❌ OpenAI API failed during DB_EMBED_NULLS:`, embedErr.message)
                break // Stop on unrecoverable API error
            }

            // d) Update bindings
            let localUpdated = 0
            for (let k = 0; k < itemsToEmbed.length; k++) {
                const row = itemsToEmbed[k]
                const embedding = newEmbeddings[k]

                if (!embedding) continue

                try {
                    await withRetry(async () => {
                        const { error: updErr } = await supabase
                            .from('qna_pairs')
                            .update({ embedding })
                            .eq('id', row.id)
                            .is('embedding', null)
                        if (updErr) throw updErr
                    })
                    localUpdated++
                } catch (dbErr: any) {
                    console.error(`[DB_EMBED_NULLS] UPDATE failed for id=${row.id}:`, dbErr.message)
                }
            }
            console.log(`[DB_EMBED_NULLS] updated=${localUpdated}`)
        }

        return // End script execution exactly here, bypassing all subsequent crawler paths.
    }

    // --- DB_UPSERT_ONLY MODE ---
    if (DB_UPSERT_ONLY) {
        console.log('\n[MODE] DB_UPSERT_ONLY: Skipping crawl and loading backup file...')
        try {
            const backupPath = path.resolve('output/qna.backup.json')
            const normalPath = path.resolve(CONFIG.outputFile)
            const filePath = fs.existsSync(backupPath) ? backupPath : normalPath
            console.log(`[DB_UPSERT_ONLY] Loading items from ${filePath}`)

            const raw = fs.readFileSync(filePath, 'utf-8')
            const parsed = JSON.parse(raw)
            items = parsed.items || parsed
            console.log(`[DB_UPSERT_ONLY] Loaded ${items.length} items`)
        } catch (err: any) {
            console.error(`❌ Failed to load items:`, err.message)
            process.exit(1)
        }
    } else if (process.env.EMBED_ONLY === '1') {
        console.log('\n[MODE] EMBED_ONLY: Skipping crawl phase, loading existing items...')
        try {
            const fileData = fs.readFileSync(path.resolve(CONFIG.outputFile), 'utf-8')
            const parsed = JSON.parse(fileData)
            items = parsed.items || []
            console.log(`Loaded ${items.length} items from ${CONFIG.outputFile}`)
        } catch (err: any) {
            console.error(`❌ Failed to load items from ${CONFIG.outputFile}:`, err.message)
            process.exit(1)
        }
    } else {
        // Launch browser
        browser = await chromium.launch({ headless: true })
        const context = await browser.newContext()
        const page = await context.newPage()

        // Dialog handler (auto-accept)
        page.on('dialog', async (dialog: any) => {
            if (CONFIG.debug) {
                console.log(`[DIALOG] ${dialog.type()}: ${dialog.message().slice(0, 120)}`)
            }
            await dialog.accept().catch(() => { })
        })

        // Ensure output dir
        const outDir = path.dirname(path.resolve(CONFIG.outputFile))
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true })
        }

        // --- INITIAL LOGIN ---
        try {
            await performLogin(page)
        } catch (e) {
            console.error('Initial login failed. Aborting.')
            await browser.close()
            process.exit(1)
        }

        try {
            const crawlFrom = process.env.CRAWL_FROM || '2025-12-01'
            const crawlTo = process.env.CRAWL_TO || getToday()
            const sliceDays = parseInt(process.env.CRAWL_SLICE_DAYS || '3', 10)

            console.log(`\n📅 Date Slicing Config: ${crawlFrom} ~ ${crawlTo} (Slice: ${sliceDays} days)`)

            let currentSliceStart = crawlFrom

            // Outer Loop: Date Slices
            while (isBeforeOrSame(currentSliceStart, crawlTo)) {
                let currentSliceEnd = addDays(currentSliceStart, sliceDays - 1)
                if (!isBeforeOrSame(currentSliceEnd, crawlTo)) {
                    currentSliceEnd = crawlTo
                }

                console.log(`\n🔹 [SLICE] Processing range: ${currentSliceStart} ~ ${currentSliceEnd}`)

                for (const startUrl of CONFIG.startUrls) {
                    console.log(`\n📂 Visiting Start URL: ${startUrl}`)

                    // Navigate to startUrl with retry logic
                    let retries = 0
                    const maxRetries = 1
                    let navigationSuccess = false

                    while (retries <= maxRetries && !navigationSuccess) {
                        try {
                            // Use domcontentloaded for faster/safer navigation if network is busy
                            await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })

                            // Check if we were redirected to login
                            const currentUrl = page.url()
                            if (currentUrl.includes(CONFIG.login.postLoginUrlNotContains)) {
                                console.warn(`[WARN] Redirected to login while accessing startUrl. Retry ${retries + 1}/${maxRetries + 1}`)
                                if (retries < maxRetries) {
                                    console.log('Attempting re-login...')
                                    await performLogin(page)
                                    retries++
                                    continue
                                } else {
                                    throw new Error('Redirected to login page after accessing startUrl (max retries reached)')
                                }
                            }
                            navigationSuccess = true
                        } catch (navError) {
                            console.error(`Navigation error (attempt ${retries + 1}):`, navError)
                            if (retries < maxRetries) {
                                retries++
                            } else {
                                throw navError
                            }
                        }
                    }

                    if (!navigationSuccess) {
                        console.error(`Failed to load startUrl: ${startUrl}`)
                        if (CONFIG.debug) {
                            const screenshotPath = path.join(outDir, `debug_starturl_fail_${Date.now()}.png`)
                            await page.screenshot({ path: screenshotPath })
                        }
                        break // Skip this url
                    }

                    try {
                        await applyListFilters(page, currentSliceStart, currentSliceEnd)

                        // Verify filters (New logic)
                        const verifyFilters = async (p: Page, eStart: string, eEnd: string) => {
                            const actualStart = await p.inputValue('#inputsearchStartDt').catch(() => '')
                            const actualEnd = await p.inputValue('#inputsearchEndDt').catch(() => '')
                            const statusVal = await p.locator('select[name="searchQnaStatus"]').inputValue().catch(() => '')

                            console.log(`[FILTER_CHECK] start=${actualStart}, end=${actualEnd}, status=${statusVal}`)

                            const toSlash = (s: string) => s.replace(/-/g, '/')
                            const startOk = actualStart === eStart || actualStart === toSlash(eStart)
                            const endOk = actualEnd === eEnd || actualEnd === toSlash(eEnd)
                            const statusOk = statusVal === '02'

                            if (!startOk || !endOk || !statusOk) {
                                const outDir = path.dirname(path.resolve(CONFIG.outputFile))
                                const ts = Date.now()
                                const ssPath = path.join(outDir, `filter_mismatch_${ts}.png`)
                                const htmlPath = path.join(outDir, `filter_mismatch_${ts}.html`)

                                await p.screenshot({ path: ssPath }).catch(() => { })
                                if (CONFIG.debug) {
                                    try { fs.writeFileSync(htmlPath, await p.content()) } catch (e) { }
                                }

                                console.log('[FILTER_CHECK] MISMATCH. Stop this slice to avoid crawling wrong range.')
                                return false
                            }
                            return true
                        }

                        if (!(await verifyFilters(page, currentSliceStart, currentSliceEnd))) {
                            continue // Skip to next url/slice
                        }

                    } catch (filterError) {
                        console.error('Error applying filters:', filterError)
                        if (CONFIG.debug) {
                            const screenshotPath = path.join(outDir, `debug_filter_fail_${Date.now()}.png`)
                            await page.screenshot({ path: screenshotPath }).catch(() => { })
                        }
                        continue // Skip to next url/slice if filter fails
                    }

                    console.log(`[SLICE_READY] entering page loop for ${currentSliceStart}~${currentSliceEnd}`)

                    // --- CRAWL LOOP FOR THIS SLICE ---
                    let safety = 0
                    let sliceItemsCollected = 0

                    while (safety < CONFIG.maxPages && items.length < CONFIG.maxItems && sliceItemsCollected < CONFIG.sliceMaxItems) {
                        safety++

                        // Trust #currPage from DOM
                        const cur = parseInt(await page.locator('#currPage').inputValue().catch(() => '1'), 10) || 1
                        console.log(`\n--- Processing Real Page ${cur} ---`)

                        // Check for EMPTY STATE within the table
                        // "table.databoard tbody tr td[colspan]" containing "조회된 데이터가 없습니다."
                        const emptyState = page.locator(CONFIG.selectors.emptyState)
                        if (await emptyState.count() > 0) {
                            const emptyText = await emptyState.first().innerText()
                            if (emptyText.includes("조회된 데이터가 없습니다")) {
                                console.log(`[SLICE] Empty state detected on page ${cur}. Finishing this slice.`)
                                break
                            }
                        }

                        // Wait for the list to be ready
                        try {
                            await page.waitForSelector(CONFIG.selectors.listLink, { state: 'attached', timeout: 10000 })
                        } catch (e) {
                            console.warn(`List selector not found on page ${cur}. Stopping slice.`)

                            // DEBUG: Capture state before stopping
                            try {
                                const currentUrl = page.url()
                                const pageTitle = await page.title()
                                console.log(`[DEBUG_LIST_FAIL] URL: ${currentUrl}`)
                                console.log(`[DEBUG_LIST_FAIL] Title: ${pageTitle}`)

                                const timestamp = Date.now()
                                const screenshotPath = path.join(outDir, `debug_list_missing_page${cur}_${timestamp}.png`)
                                const htmlPath = path.join(outDir, `debug_list_missing_page${cur}_${timestamp}.html`)

                                await page.screenshot({ path: screenshotPath }).catch(() => { })
                                if (CONFIG.debug) {
                                    try { fs.writeFileSync(htmlPath, await page.content()) } catch (e) { }
                                    console.log(`[DEBUG_LIST_FAIL] Saved HTML: ${htmlPath}`)
                                }
                            } catch (debugErr) {
                                console.error("Failed to capture debug info:", debugErr)
                            }

                            break
                        }


                        // Verify list state
                        await assertListReady(page, `LoopStart_Page${cur}`)

                        const listUrl = page.url()

                        // Snapshot items to avoid stale locators
                        // Snapshot items using Locator (avoid context issues)
                        const loc = page.locator(CONFIG.selectors.listLink)
                        const count = await loc.count().catch(() => 0)
                        console.log(`[SNAPSHOT] selector=${CONFIG.selectors.listLink}`)
                        console.log(`[SNAPSHOT] locatorCount=${count}`)

                        const scannedRows: { bno: string | null, title: string }[] = []
                        for (let i = 0; i < Math.min(count, 50); i++) {
                            const a = loc.nth(i)
                            scannedRows.push({
                                bno: await a.getAttribute('bno').catch(() => null),
                                title: await a.innerText().catch(() => '')
                            })
                        }
                        const rows = scannedRows.filter(r => !!r.bno)
                        console.log(`[SNAPSHOT] rows=${rows.length}`)

                        if (rows.length === 0) {
                            const ts = Date.now()
                            const ssPath = path.join(outDir, `debug_rows0_page${cur}_${ts}.png`)
                            const htmlPath = path.join(outDir, `debug_rows0_page${cur}_${ts}.html`)

                            console.warn(`[SNAPSHOT] 0 items found on page ${cur}. Breaking loop to avoid infinite paging on empty list.`)
                            if (CONFIG.debug) {
                                await page.screenshot({ path: ssPath }).catch(() => { })
                                try { fs.writeFileSync(htmlPath, await page.content()) } catch (e) { }
                                console.log(`Saved debug info to ${ssPath}`)
                            }
                            // If items=0 on a legitimate filter page, it just means no entries for this slice phase. 
                            // Break the page loop to move on to the next date slice
                            console.log(`[SLICE] Empty list on page ${cur}. Moving to next slice.`)
                            break
                        }

                        for (const row of rows) {
                            if (items.length >= CONFIG.maxItems) break
                            if (sliceItemsCollected >= CONFIG.sliceMaxItems) break

                            const { bno, title: titleText } = row

                            // 1. Re-locate item fresh
                            let item = page.locator(`a[name='linkBTitle'][bno="${bno}"]`).first()

                            // 2. If missing, attempt ONE re-sync (reload current page index)
                            if (await item.count() === 0) {
                                console.warn(`[WARN] bno=${bno} missing after return. Reloading current page to sync.`)
                                const curVal = await page.locator('#currPage').inputValue().catch(() => '1')
                                const reloadPage = parseInt(curVal, 10) || 1

                                const curLink = page.locator(`p.pagnation a[href="javascript:pageMove(${reloadPage})"]`).first()
                                if (await curLink.count() > 0) {
                                    await curLink.click()
                                } else {
                                    await page.locator('#btnSearch').click()
                                }
                                await page.waitForLoadState('load')
                                await page.waitForSelector(CONFIG.selectors.listLink, { state: 'attached', timeout: 15000 })

                                // Retry locate once
                                item = page.locator(`a[name='linkBTitle'][bno="${bno}"]`).first()
                                if (await item.count() === 0) {
                                    console.warn(`[SKIP] Item bno=${bno} still missing after reload.`)
                                    continue
                                }
                            }

                            try {
                                // Ensure it is visible per user request
                                await item.scrollIntoViewIfNeeded().catch(() => { })

                                // A) Submit Form Navigation (Click item link directly)
                                await Promise.all([
                                    page.waitForLoadState('load'),
                                    item.click()
                                ])

                                // B) Wait for detail ready
                                try {
                                    const qLoc = page.locator(CONFIG.selectors.question)
                                    const aLoc = page.locator(CONFIG.selectors.answer)
                                    await Promise.race([
                                        qLoc.waitFor({ state: 'attached', timeout: 10000 }),
                                        aLoc.waitFor({ state: 'attached', timeout: 10000 })
                                    ])
                                } catch (e) {
                                    console.warn('[WARN] detail selectors timeout')
                                }
                                await page.waitForTimeout(500)
                                await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => { })

                                // C) Extract Content
                                const currentUrl = page.url()

                                const qCandidates = [
                                    CONFIG.selectors.question,
                                    'td[id*=Qna], div[id*=Qna]',
                                    'table.boardwrite td',
                                    'body'
                                ]
                                const question = await pickText(page, qCandidates)

                                const aCandidates = [
                                    CONFIG.selectors.answer,
                                    'td[id*=Content], div[id*=Content]',
                                    'table.boardwrite td',
                                    'body'
                                ]
                                const answer = await pickText(page, aCandidates)

                                // Robust Lecture Name Extraction
                                let lectureName = ""
                                try {
                                    const containerLoc = page.locator(CONFIG.selectors.lectureContainer)
                                    if (await containerLoc.count() > 0) {
                                        const rows = containerLoc.locator('tr')
                                        const rowCount = await rows.count()
                                        for (let r = 0; r < rowCount; r++) {
                                            const row = rows.nth(r)
                                            const header = row.locator('th, td').first()
                                            if (await header.count() > 0) {
                                                const ht = await header.innerText()
                                                if (ht && ht.trim().includes("강좌/강의")) {
                                                    const cells = row.locator('td')
                                                    if (await cells.count() > 0) {
                                                        lectureName = await cells.nth(0).innerText()
                                                        break
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.warn('Error in label-based lecture extraction:', e)
                                }

                                if (!lectureName) {
                                    lectureName = await page.textContent(CONFIG.selectors.lectureNameFallback).catch(() => "") || ""
                                }

                                lectureName = normalizeText(lectureName)
                                lectureName = lectureName.replace(/(\s*\(?[pP]age\.?\s*\d+\)?|\s*\d+\s*페이지|\s*\(?[p]\.?\s*\d+\)?)$/, "").trim()

                                let courseKey = null
                                const lowerName = lectureName.toLowerCase()
                                if (lowerName.includes("kissave")) {
                                    courseKey = "kissave_2027"
                                } else if (lowerName.includes("키스키마")) {
                                    courseKey = "kisschema_2027"
                                } else if (lowerName.includes("kiss logic")) {
                                    courseKey = "kiss_logic_2027"
                                } else if (lowerName.includes("frequency")) {
                                    courseKey = "frequency_2027"
                                }

                                if (question && answer) {
                                    const isDuplicate = items.some(existing => existing.question === question)
                                    if (!isDuplicate) {
                                        items.push({
                                            source: new URL(startUrl).hostname,
                                            url: currentUrl,
                                            question,
                                            answer,
                                            bno: bno || undefined,
                                            title: normalizeText(titleText),
                                            lecture_name: lectureName,
                                            course_key: courseKey
                                        })
                                        sliceItemsCollected++
                                        process.stdout.write('+')
                                    } else {
                                        process.stdout.write('.')
                                    }
                                } else {
                                    process.stdout.write('x')
                                    console.warn(`\n[DEBUG] Empty content for bno=${bno}`)
                                    console.warn(`[DEBUG] url: ${currentUrl}`)
                                    console.warn(`[DEBUG] titleText: ${titleText}`)
                                    console.warn(`[DEBUG] selectors tried for question: ${qCandidates.join(', ')}`)
                                    console.warn(`[DEBUG] selectors tried for answer: ${aCandidates.join(', ')}`)

                                    const ts = Date.now()
                                    const ssPath = path.join(outDir, `debug_empty_${bno}_${ts}.png`)
                                    const htmlPath = path.join(outDir, `debug_empty_${bno}_${ts}.html`)
                                    await page.screenshot({ path: ssPath }).catch(() => { })
                                    if (CONFIG.debug) {
                                        try { fs.writeFileSync(htmlPath, await page.content()) } catch (e) { }
                                        console.log(`[DEBUG] Saved snapshot to ${ssPath} and ${htmlPath}`)
                                    }
                                }

                            } catch (actionError) {
                                console.error(`\n[WARN] Failed to process item bno=${bno} (page ${cur}). Err:`, (actionError as any).message)
                                if (CONFIG.debug) {
                                    const screenshotPath = path.join(outDir, `debug_click_fail_page${cur}_bno${bno}.png`)
                                    await page.screenshot({ path: screenshotPath }).catch(() => { })
                                }
                            } finally {
                                // D) Return to List (Simple Back)
                                try {
                                    await page.goBack({ waitUntil: 'load' })
                                    await page.waitForSelector(CONFIG.selectors.listLink, { state: 'attached', timeout: 15000 })
                                } catch (restoreError) {
                                    console.error(`[CRITICAL] Failed to goBack to list! Aborting slice.`, restoreError)
                                }
                            }
                        }

                        console.log(`[PROGRESS] slice=${currentSliceStart}~${currentSliceEnd} page=${cur} itemsSoFar=${items.length}`)

                        // Pagination Logic: Drive to next page
                        const currentReal = await getCurrPage(page)
                        if (items.length < CONFIG.maxItems && currentReal < CONFIG.maxPages) {
                            const next = currentReal + 1
                            console.log(`\n--- Pagination: Current=${currentReal}, Target=${next} ---`)

                            // 1) Capture before-pagination state
                            const prevBno = await page.locator(CONFIG.selectors.listLink).first().getAttribute('bno').catch(() => null)
                            const prevCurr = await page.locator('#currPage').inputValue().catch(() => '')

                            // 2) Trigger pagination
                            const moved = await clickPageNumber(page, next)

                            if (!moved) {
                                console.log(`[PAGINATION] No next page control for target=${next}. Stop.`)
                                break
                            }

                            // 3) Robust wait for #currPage -> targetStr
                            const targetStr = String(next)
                            await page.waitForFunction(
                                (t: any) => {
                                    const el = document.querySelector('#currPage') as HTMLInputElement | null
                                    return !!el && String(el.value) === String(t)
                                },
                                targetStr,
                                { timeout: 15000 }
                            ).catch(() => { })

                            // After wait, read currPageVal again
                            const currVal = await page.locator('#currPage').inputValue().catch(() => '')

                            if (currVal !== targetStr) {
                                console.warn(`[PAGINATION] currVal=${currVal} !== targetStr=${targetStr}. Trying one more click via evaluate fallback...`)

                                // 4) Fallback retry if currVal didn't update
                                await page.evaluate((n: number) => (window as any).pageMove(n), next).catch(() => { })

                                await page.waitForFunction(
                                    (t: any) => {
                                        const el = document.querySelector('#currPage') as HTMLInputElement | null
                                        return !!el && String(el.value) === String(t)
                                    },
                                    targetStr,
                                    { timeout: 15000 }
                                ).catch(() => { })

                                const currValRetry = await page.locator('#currPage').inputValue().catch(() => '')
                                if (currValRetry !== targetStr) {
                                    console.warn(`[SLICE_WARN] pagination failed, skipping remaining pages in this slice. (currPage still not ${targetStr})`)
                                    break
                                }
                            }

                            // 4.5) Add list-refresh verification (to avoid "currPage updated but list not refreshed")
                            const getFirstBno = () => page.locator(CONFIG.selectors.listLink).first().getAttribute('bno').catch(() => null);
                            let firstBnoAfter = await getFirstBno();

                            if (prevBno && firstBnoAfter === prevBno) {
                                console.log(`[PAGINATION] currPage updated but list stale. Waiting for bno to change...`)
                                let refreshed = false;

                                // 1) Wait loop (max 6 seconds) for firstBno changes
                                for (let k = 0; k < 12; k++) {
                                    await page.waitForTimeout(500)
                                    const bnoNow = await getFirstBno()
                                    if (bnoNow && bnoNow !== prevBno) {
                                        refreshed = true;
                                        break;
                                    }
                                }

                                // 2) If still stale, perform ONE retry
                                if (!refreshed) {
                                    console.warn(`[PAGINATION] list didn't refresh after 6s (bno ${prevBno} matches). Retrying pageMove...`)
                                    await page.evaluate((n: number) => (window as any).pageMove(n), next).catch(() => { })

                                    // wait again up to 6 seconds for firstBno to change
                                    for (let k = 0; k < 12; k++) {
                                        await page.waitForTimeout(500)
                                        const bnoNow = await getFirstBno()
                                        if (bnoNow && bnoNow !== prevBno) {
                                            refreshed = true;
                                            break;
                                        }
                                    }

                                    // 3) If still stale after retry, warn and proceed
                                    if (!refreshed) {
                                        console.warn(`[PAGINATION] list still stale after retry wait loop. Proceeding anyway...`)
                                    }
                                }
                            }

                            console.log(`[PAGINATION] moved ok: currPage=${await getCurrPage(page)}`)

                            // List is already asserted by waitForFunction implying DOM update, but let's be safe
                            await assertListReady(page, `after pagination to ${next}`)
                        } else {
                            console.log(`[STOP_DIAG] items=${items.length}/${CONFIG.maxItems}, page=${currentReal}/${CONFIG.maxPages}, sliceItems=${sliceItemsCollected}/${CONFIG.sliceMaxItems}`)
                            console.log(`\n[STOP] Reached max items or max pages safety.`)
                            break
                        }
                    } // End while (safety)
                } // End for (startUrls)

                // Increment slice for next iteration
                currentSliceStart = addDays(currentSliceEnd, 1)

            } // End while (dateSlices)

        } catch (error) {
            console.error('Crawler failed:', error)
        } finally {
            if (browser) {
                await browser.close()
            }
        }

        console.log(`\n\n✅ Crawl complete. Collected ${items.length} items.`)

        // Save crawler output
        fs.writeFileSync(path.resolve(CONFIG.outputFile), JSON.stringify({ items }, null, 2))
        console.log(`Saved crawler output to ${CONFIG.outputFile}`)
    } // End of NORMAL mode else block

    // --- DB PERSISTENCE START ---
    console.log('\n💾 Starting DB Persistence...')

    let insertedCount = 0
    let updatedCount = 0 // Not accurately tracked in simple upsert without checking return, but we can infer or strict to batches
    // Ideally we want to know success counts. Upsert returns minimal info usually unless we select count.

    // We will track successful batches.
    let upsertBatchesSucceeded = 0
    let upsertBatchesFailed = 0
    let embeddedCount = 0
    let dbErrorCount = 0
    let lastDbError = ''
    let validItemsCount = 0

    try {
        const validItems: QnaItem[] = []
        let skippedValidation = 0

        // A) Build validItems
        for (const item of items) {
            const question = normalizeText(item.question)
            const answer = normalizeText(item.answer)

            if (!question || !answer) {
                skippedValidation++
                continue
            }
            if ((question.length + answer.length) < 80) {
                skippedValidation++
                continue
            }

            // Ensure course_key regex
            let safeCourseKey: string | null = item.course_key || null
            if (safeCourseKey && !/^[a-z0-9_]+$/.test(safeCourseKey)) {
                safeCourseKey = null
            }

            const bno = item.bno != null ? String(item.bno).trim() : undefined

            validItems.push({
                ...item,
                bno,
                question,
                answer,
                course_key: safeCourseKey
            })
        }
        validItemsCount = validItems.length
        console.log(`Valid items: ${validItemsCount} (Skipped ${skippedValidation} invalid)`)

        // B) Direct Batch Upsert (Batch Size 200)
        const UPSERT_BATCH_SIZE = 200
        for (let i = 0; i < validItems.length; i += UPSERT_BATCH_SIZE) {
            const batch = validItems.slice(i, i + UPSERT_BATCH_SIZE)
            if (batch.length === 0) continue

            // Prepare rows - strict payload
            const rows = batch.map(item => ({
                bno: item.bno ?? null,
                url: item.url ?? null,
                question: item.question,
                answer: item.answer ?? '',
                source: item.source ?? 'tzone',
                course_key: item.course_key ?? null
            }))

            try {
                await withRetry(async () => {
                    const { error } = await supabase
                        .from('qna_pairs')
                        .upsert(rows, { onConflict: 'source,question' })

                    if (error) throw error
                })
                upsertBatchesSucceeded++
                insertedCount += rows.length // Approximate, could be updates
                process.stdout.write('U') // Upsert success
            } catch (err: any) {
                console.error(`\n[DB] Upsert batch ${i} failed after retries:`, err.message)
                upsertBatchesFailed++
                dbErrorCount++
                lastDbError = err.message
            }
        }
        console.log('\nMiddleware upsert phase complete.')

        // C) Embedding Generation (Batch size 50)
        // We do this AFTER upserting text to ensure text is saved even if embedding fails later?
        // Actually, request says "update qna_pairs.embedding using match on (source,question)".
        // Yes, separate pass is robust.

        if (!DB_UPSERT_ONLY) {
            console.log('Generating Embeddings...')
            const EMBED_BATCH_SIZE = 20
            for (let i = 0; i < validItems.length; i += EMBED_BATCH_SIZE) {
                const batch = validItems.slice(i, i + EMBED_BATCH_SIZE)
                if (batch.length === 0) continue

                try {
                    // a) Build an identifier list 
                    const batchBnos = batch.map(item => item.bno).filter(Boolean) as string[]
                    const distinctQuestions = Array.from(new Set(batch.map(item => item.question)))

                    console.log(`\n[EMBED] batch=${i} bnos=${batchBnos.length}`)

                    // b) Query qna_pairs for ONLY rows that still need embeddings
                    const fetchMissingEmbeddings = async (retries = 3) => {
                        for (let attempt = 1; attempt <= retries; attempt++) {
                            let query = supabase
                                .from('qna_pairs')
                                .select('bno, question, answer')
                                .is('embedding', null)

                            // Filter by bno if available, else fallback to (source, question)
                            if (batchBnos.length > 0) {
                                query = query.in('bno', batchBnos)
                            } else {
                                query = query.eq('source', batch[0].source).in('question', distinctQuestions)
                            }

                            const { data, error } = await query

                            if (!error) return { data, error: null };

                            console.warn(`[WARN] Missing embedding fetch failed (attempt ${attempt}/${retries}): ${error.message}`)
                            if (attempt < retries) {
                                const delayMs = Math.pow(2, attempt - 1) * 1000;
                                await delay(delayMs);
                            } else {
                                return { data: null, error };
                            }
                        }
                        return { data: null, error: new Error('Max retries reached') };
                    }

                    const { data: missingRows, error: fetchError } = await fetchMissingEmbeddings(3)

                    if (fetchError) {
                        throw new Error(`Failed to fetch missing embeddings: ${fetchError.message}`)
                    }

                    console.log(`[EMBED_DEBUG] fetched=${missingRows?.length || 0}, sample=`, missingRows?.slice(0, 3).map((r: any) => ({ bno: r.bno, isNull: r.embedding == null })))

                    const itemsToEmbed = missingRows || []
                    console.log(`[EMBED] needEmbedding=${itemsToEmbed.length}`)

                    // c) If result length is 0 -> log and continue
                    if (itemsToEmbed.length === 0) {
                        continue
                    }

                    // d) Generate OpenAI embeddings only for those rows
                    // Using bno or question/answer from the retrieved DB rows for exact match
                    const textsToEmbed = itemsToEmbed.map(item => {
                        const q = item.question || ''
                        const a = item.answer || ''
                        return `${q}\n\n${a}`
                    })

                    let newEmbeddings: number[][] = []

                    await withRetry(async () => {
                        const resp = await openai.embeddings.create({
                            model: 'text-embedding-3-small',
                            input: textsToEmbed
                        })
                        newEmbeddings = resp.data.map(d => d.embedding)
                    })

                    // e) Update embeddings with safety condition
                    let localBatchSuccess = 0
                    for (let k = 0; k < itemsToEmbed.length; k++) {
                        const item = itemsToEmbed[k]
                        const embedding = newEmbeddings[k]

                        if (!embedding) continue;

                        try {
                            await withRetry(async () => {
                                let updateQuery = supabase
                                    .from('qna_pairs')
                                    .update({ embedding: embedding })
                                    .is('embedding', null) // Critical safety to never overwrite unexpectedly

                                if (item.bno) {
                                    updateQuery = updateQuery.eq('bno', item.bno)
                                } else {
                                    updateQuery = updateQuery.eq('question', item.question)
                                }

                                const { error } = await updateQuery
                                if (error) throw error
                            })
                            localBatchSuccess++
                            process.stdout.write('E')
                        } catch (updateErr: any) {
                            console.error(`\n[DB] Embedding UPDATE failed for item:`, updateErr.message)
                        }
                    }

                    console.log(`\n[EMBED] updated=${localBatchSuccess}`)
                    embeddedCount += localBatchSuccess

                } catch (err: any) {
                    console.error(`\n[DB] Embedding batch ${i} failed:`, err.message)
                    dbErrorCount++
                    lastDbError = err.message
                }
            }
        } else {
            console.log('[DB_UPSERT_ONLY] Skipping embedding generation')
        }


    } catch (criticalError: any) {
        console.error('\n❌ Critical DB Persistence Error:', criticalError)
        dbErrorCount++
        lastDbError = criticalError.message
    }

    console.log('\n\n--- Persistence Summary ---')
    console.log(`Crawled: ${items.length}`)
    console.log(`Valid Items: ${validItemsCount}`)
    console.log(`Upsert Batches: ${upsertBatchesSucceeded} Succeeded / ${upsertBatchesFailed} Failed`)
    console.log(`Embedded Items: ${embeddedCount}`)
    console.log(`DB Errors: ${dbErrorCount}`)
    if (lastDbError) console.log(`Last Error: ${lastDbError}`)

    if (DB_UPSERT_ONLY) {
        console.log('[DB_UPSERT_ONLY] Upsert completed without embedding')
    }
    // --- DB PERSISTENCE END ---
}

run()
