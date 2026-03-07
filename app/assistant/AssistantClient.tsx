'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'
import Image from 'next/image'

type Matches = {
    page: number
    similarity: number
}

type ReferenceInfo = {
    courseKey: string | null
    courseName: string | null
    documentTitle: string
    documentId: string
    page: number
    similarity: number
    highlightText?: string
}



interface AssistantClientProps {
    isAdmin: boolean
}

export default function AssistantClient({ isAdmin }: AssistantClientProps) {
    useInactivityLogout()

    const [question, setQuestion] = useState('')
    const [answer, setAnswer] = useState('')
    const [originalAnswer, setOriginalAnswer] = useState('') // For reset
    const [loading, setLoading] = useState(false)
    const [loadingMessage, setLoadingMessage] = useState('') // For distinct states

    // Copy toast state
    const [copied, setCopied] = useState(false)

    // Retrieval results
    const [refPages, setRefPages] = useState<number[]>([])
    const [references, setReferences] = useState<ReferenceInfo[]>([])
    const [matches, setMatches] = useState<Matches[]>([])
    const [retrievalMode, setRetrievalMode] = useState<string>('')
    const [error, setError] = useState<string | null>(null)
    const [lowConfidence, setLowConfidence] = useState(false)
    const [taFinalAnswer, setTaFinalAnswer] = useState<string | null>(null)

    // TA Feedback State
    const [feedbackVisible, setFeedbackVisible] = useState(false)
    const [finalAnswer, setFinalAnswer] = useState('')
    const [feedbackComment, setFeedbackComment] = useState('')
    const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
    const [feedbackSuccess, setFeedbackSuccess] = useState(false)

    // Auto-focus ref
    const answerRef = useRef<HTMLTextAreaElement>(null)

    const supabase = createClient()
    const router = useRouter()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.refresh()
        router.push('/login')
    }

    const [courses, setCourses] = useState<any[]>([])
    const [selectedCourse, setSelectedCourse] = useState<string>('') // Default ""
    const [selectedCourseName, setSelectedCourseName] = useState<string>('All Courses')

    // Course loading state
    const [loadingCourses, setLoadingCourses] = useState(true)
    const [courseError, setCourseError] = useState<string | null>(null)

    // Fetch courses on mount
    useEffect(() => {
        const fetchCourses = async () => {
            setLoadingCourses(true)
            setCourseError(null)
            try {
                const res = await fetch('/api/courses')
                if (res.ok) {
                    const data = await res.json()
                    setCourses(data.courses || [])
                } else {
                    setCourseError('Failed to load courses')
                }
            } catch (err) {
                console.error('Failed to fetch courses:', err)
                setCourseError('Failed to load courses')
            } finally {
                setLoadingCourses(false)
            }
        }
        fetchCourses()
    }, [])

    const handleCourseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const key = e.target.value
        setSelectedCourse(key)

        if (key) {
            const found = courses.find(c => c.course_key === key)
            setSelectedCourseName(found?.course_name || found?.course_key || key)
        } else {
            setSelectedCourseName('All Courses')
        }
    }

    const handleGenerate = async () => {
        if (!question.trim()) return

        setLoading(true)
        setLoadingMessage('Searching materials...')
        setError(null)
        setAnswer('')
        setOriginalAnswer('')
        setRefPages([])
        setReferences([])
        setMatches([])
        setCopied(false)
        setRetrievalMode('')
        setLowConfidence(false)
        setTaFinalAnswer(null)

        // Reset feedback
        setFeedbackVisible(false)
        setFinalAnswer('')
        setFeedbackComment('')
        setFeedbackSuccess(false)

        // Simulate distinct loading states (visual only)
        const loadingTimer = setTimeout(() => {
            setLoadingMessage('Generating draft...')
        }, 1500)

        try {
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    course_key: selectedCourse
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Failed to generate answer')
            }

            setAnswer(data.answer)
            setOriginalAnswer(data.answer)
            setRefPages(data.referencesPages || [])
            setReferences(data.references || [])
            setMatches(data.matches || [])
            setRetrievalMode(data.retrieval?.textbookMode || '')
            setLowConfidence(data.lowConfidence || false)
            setTaFinalAnswer(data.taFinalAnswer || null)

            // Auto-focus on success
            setTimeout(() => {
                answerRef.current?.focus()
            }, 100)

        } catch (err: any) {
            setError(err.message)
        } finally {
            clearTimeout(loadingTimer)
            setLoading(false)
        }
    }

    const copyToClipboard = () => {
        navigator.clipboard.writeText(answer)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const resetToDraft = () => {
        setAnswer(originalAnswer)
        answerRef.current?.focus()
    }

    const clearAll = () => {
        setQuestion('')
        setAnswer('')
        setOriginalAnswer('')
        setRefPages([])
        setReferences([])
        setMatches([])
        setLowConfidence(false)
        setTaFinalAnswer(null)
        setError(null)
        setCopied(false)
        setFeedbackVisible(false)
        setFinalAnswer('')
        setFeedbackComment('')
        setFeedbackSuccess(false)
    }

    const submitFeedback = async () => {
        if (!originalAnswer) return;
        setFeedbackSubmitting(true);
        try {
            const res = await fetch('/api/assistant/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    modelAnswer: originalAnswer,
                    finalAnswer: finalAnswer.trim() || answer.trim() || null,
                    comment: feedbackComment.trim() || null,
                    courseKey: selectedCourse || null,
                    referenceMeta: references,
                    lowConfidence
                }),
            });
            if (!res.ok) throw new Error('Failed to submit feedback');
            setFeedbackSuccess(true);
            setTimeout(() => setFeedbackVisible(false), 2000);
        } catch (err) {
            console.error('Feedback error:', err);
        } finally {
            setFeedbackSubmitting(false);
        }
    }

    // Evidence Confidence Logic
    const showLowConfidenceWarning = (answer && lowConfidence)

    return (
        <div className="font-sans bg-[#f6f6f8] text-slate-900 min-h-screen relative overflow-hidden flex flex-col dark:bg-[#161121] dark:text-slate-100">
            {/* Abstract Background Elements */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#0B1E59]/20 blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-950/30 blur-[150px]"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-br from-[#161121] via-[#161121] to-[#201633] opacity-0 dark:opacity-100 transition-opacity"></div>
            </div>

            {/* Header */}
            <header className="relative z-10 bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700/50 px-6 py-4 flex items-center justify-between sticky top-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 flex items-center justify-center">
                            <Image src="/branding/kissist_robotK_header_logo.png" alt="KISSist Logo" width={32} height={32} className="object-contain" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 italic">KISSist</h1>
                    </div>
                    {/* Back to Admin Label - Only visible if Admin */}
                    {isAdmin && (
                        <Link
                            href="/admin"
                            className="text-xs font-bold text-[#0B1E59] dark:text-[#3d5ab3] bg-[#0B1E59]/10 dark:bg-[#0B1E59]/20 px-3 py-1.5 rounded-full hover:bg-[#0B1E59]/20 transition-colors flex items-center gap-1"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                            Back to Admin
                        </Link>
                    )}
                </div>
                <button
                    onClick={handleLogout}
                    className="text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors"
                >
                    Sign Out
                </button>
            </header>

            {/* Main Content */}
            <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Left Column: Input */}
                <section className="flex flex-col gap-4">
                    <div className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl shadow-xl flex flex-col h-[60vh] transition-all overflow-hidden">

                        {/* Course Selector Header */}
                        <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Course Context</label>
                                {courseError && <span className="text-xs text-red-500 font-medium">{courseError}</span>}
                            </div>
                            <div className="relative">
                                <select
                                    value={selectedCourse}
                                    onChange={handleCourseChange}
                                    disabled={loadingCourses}
                                    className="appearance-none w-full bg-white dark:bg-[#161121]/50 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-2.5 pl-4 pr-10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0B1E59]/50 focus:border-[#0B1E59] cursor-pointer disabled:opacity-50 transition-all"
                                >
                                    <option value="">All Courses</option>
                                    {courses.map(c => (
                                        <option key={c.course_key} value={c.course_key}>
                                            {c.course_name ? c.course_name : c.course_key}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                    {loadingCourses ? (
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                    )}
                                </div>
                            </div>
                        </div>

                        <textarea
                            className="flex-1 w-full p-6 resize-none bg-transparent focus:outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 text-lg leading-relaxed"
                            placeholder="Enter the student's question here..."
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                        />
                        <div className="p-5 border-t border-slate-200/60 dark:border-slate-700/50 flex justify-between items-center bg-white/40 dark:bg-slate-800/40">
                            <span className={`text-xs ${question.trim().length === 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                {question.length} chars {question.trim().length === 0 && '(Required)'}
                            </span>
                            <div className="flex items-center gap-3">
                                {loading && (
                                    <span className="text-xs font-bold text-[#0B1E59] dark:text-[#3d5ab3] animate-pulse">
                                        {loadingMessage}
                                    </span>
                                )}
                                <button
                                    onClick={handleGenerate}
                                    disabled={loading || !question.trim()}
                                    className={`px-8 py-3 rounded-xl font-bold text-white transition-all shadow-lg
                                        ${loading || !question.trim()
                                            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                                            : 'bg-gradient-to-r from-[#0B1E59] to-blue-800 hover:from-[#081745] hover:to-blue-700 shadow-[#0B1E59]/30 active:scale-[0.98]'
                                        }`}
                                >
                                    {loading ? 'Processing...' : 'Generate Draft'}
                                </button>
                            </div>
                        </div>
                    </div>
                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center gap-2">
                            ⚠️ Error: {error}
                        </div>
                    )}
                </section>

                {/* Right Column: Output & References */}
                <section className="flex flex-col gap-6 h-[calc(100vh-140px)] overflow-y-auto pr-1">

                    {/* Answer Area */}
                    <div className={`bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl shadow-xl flex flex-col min-h-[400px] transition-all ${loading ? 'opacity-70 pointer-events-none' : ''}`}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40 rounded-t-2xl">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Answer Draft</span>
                                {selectedCourse && (
                                    <span className="text-[10px] font-bold bg-[#0B1E59]/10 text-[#0B1E59] dark:text-[#3d5ab3] px-2.5 py-1 rounded-md border border-[#0B1E59]/20">
                                        {selectedCourseName}
                                    </span>
                                )}
                                {showLowConfidenceWarning && (
                                    <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2.5 py-1 rounded-md border border-orange-200">
                                        참고 페이지 부족
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {originalAnswer && answer !== originalAnswer && (
                                    <button
                                        onClick={resetToDraft}
                                        className="text-xs font-bold text-slate-500 hover:text-[#0B1E59] hover:bg-[#0B1E59]/10 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        Reverse Changes
                                    </button>
                                )}
                                <button
                                    onClick={copyToClipboard}
                                    disabled={!answer}
                                    className={`text-xs font-bold px-4 py-1.5 rounded-lg transition-all disabled:opacity-50
                                        ${copied
                                            ? 'bg-green-100 text-green-700'
                                            : 'text-[#0B1E59] dark:text-[#3d5ab3] hover:bg-[#0B1E59]/10 bg-white/50 dark:bg-transparent shadow-sm'
                                        }`}
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                                <button
                                    onClick={clearAll}
                                    className="text-xs font-bold text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>

                        {showLowConfidenceWarning && (
                            <div className="bg-orange-50 px-4 py-2 text-xs text-orange-800 border-b border-orange-100">
                                ⚠️ <b>확인 필요:</b> 참고 페이지를 충분히 찾지 못했습니다. 관련 교재가 아닌 다른 주제거나 추가 정보가 필요할 수 있습니다.
                            </div>
                        )}

                        {taFinalAnswer && (
                            <div className="bg-green-50 border-l-4 border-green-500 p-4 m-4 rounded-r-md">
                                <h3 className="text-sm font-bold text-green-800 mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    조교 확정 답안
                                </h3>
                                <div className="text-sm text-green-900 whitespace-pre-wrap">{taFinalAnswer}</div>
                            </div>
                        )}

                        <textarea
                            ref={answerRef}
                            className="w-full text-slate-800 dark:text-slate-100 bg-transparent p-6 focus:outline-none leading-relaxed text-base min-h-[300px] resize-y overflow-y-auto"
                            placeholder="Generated answer will appear here..."
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                        />
                    </div>

                    {/* Content References */}
                    {(!lowConfidence && references.length > 0) && (
                        <div className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl shadow-xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-200/60 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40 flex justify-between items-center">
                                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Textbook References</h3>
                                <div className="text-xs font-bold text-slate-400">
                                    {references.length} pages
                                </div>
                            </div>
                            <div className="p-5">
                                <div className="flex flex-col gap-5">
                                    {(() => {
                                        // 1. Group by book
                                        const groups = references.reduce((acc, ref) => {
                                            const group = acc.find(g => g.title === ref.documentTitle && g.courseKey === ref.courseKey);
                                            if (group) {
                                                if (!group.pages.some(p => p.page === ref.page)) {
                                                    group.pages.push(ref);
                                                }
                                            } else {
                                                acc.push({ title: ref.documentTitle, courseKey: ref.courseKey, courseName: ref.courseName, pages: [ref] });
                                            }
                                            return acc;
                                        }, [] as { title: string, courseKey: string | null, courseName: string | null, pages: ReferenceInfo[] }[]);

                                        // 2. Limit and flatten
                                        let renderingGroups = [];
                                        let totalPages = 0;
                                        for (const g of groups) {
                                            if (totalPages >= 6) break;
                                            const allowed = Math.min(3, 6 - totalPages);
                                            const pagesToRender = g.pages.slice(0, allowed);
                                            if (pagesToRender.length > 0) {
                                                renderingGroups.push({ ...g, pages: pagesToRender });
                                                totalPages += pagesToRender.length;
                                            }
                                        }

                                        return renderingGroups.map((group, i) => (
                                            <div key={i} className="flex flex-col gap-2.5 mb-5 last:mb-0">
                                                <div className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                                    <div className="w-1.5 h-4 bg-[#0B1E59] rounded-full"></div>
                                                    {group.title} <span className="text-slate-400 dark:text-slate-500 font-medium">({group.courseKey || 'All Courses'})</span>
                                                </div>
                                                <div className="flex flex-col gap-1.5 pl-3.5">
                                                    {group.pages.map((p, j) => (
                                                        <div key={j} className="text-sm text-slate-600 dark:text-slate-300 flex gap-3 items-start py-1.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0 relative">
                                                            <div className="absolute left-[-15px] top-3.5 w-[6px] h-[6px] border-l-2 border-b-2 border-slate-300 dark:border-slate-600 rounded-bl-sm pointer-events-none"></div>
                                                            <span className="font-bold min-w-[2.5rem] shrink-0 text-[#0B1E59] dark:text-[#3d5ab3]">p.{p.page}</span>
                                                            <span className="text-slate-500 dark:text-slate-400 flex-1 leading-snug break-all sm:break-normal">{p.highlightText || '내용 요약 없음'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Feedback Panel */}
                    {originalAnswer && (
                        <div className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl shadow-xl overflow-hidden mt-2 flex-shrink-0">
                            {!feedbackVisible ? (
                                <button
                                    onClick={() => {
                                        setFinalAnswer(answer);
                                        setFeedbackVisible(true);
                                        setFeedbackSuccess(false);
                                    }}
                                    className="w-full text-center py-4 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-[#0B1E59] dark:hover:text-[#3d5ab3] hover:bg-white/40 dark:hover:bg-slate-800/40 transition-all flex justify-center items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    조교 피드백 작성하기
                                </button>
                            ) : (
                                <div className="p-5 border-t border-slate-200/60 dark:border-slate-700/50 bg-white/40 dark:bg-slate-800/40 transition-all flex flex-col gap-5">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">답변 평가 및 수정</h3>
                                        <button onClick={() => setFeedbackVisible(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold text-xs bg-slate-200/50 dark:bg-slate-700/50 px-3 py-1.5 rounded-lg">
                                            닫기
                                        </button>
                                    </div>

                                    {/* Edited Answer */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#0B1E59] dark:text-[#3d5ab3] uppercase tracking-wider mb-2">
                                            조교 최종 답안 (핵심 정리 + 설명)
                                        </label>
                                        <textarea
                                            value={finalAnswer}
                                            onChange={(e) => setFinalAnswer(e.target.value)}
                                            className="w-full text-sm p-4 bg-white dark:bg-[#161121]/50 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0B1E59] focus:ring-1 focus:ring-[#0B1E59] min-h-[150px] resize-y overflow-y-auto shadow-inner"
                                            placeholder="학생에게 노출될 이상적인 답안 형태로 수정해주세요."
                                        />
                                    </div>

                                    {/* Comment */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                            코멘트 (개발자/관리자 참고용)
                                        </label>
                                        <textarea
                                            value={feedbackComment}
                                            onChange={(e) => setFeedbackComment(e.target.value)}
                                            className="w-full text-sm p-4 bg-white dark:bg-[#161121]/50 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0B1E59] focus:ring-1 focus:ring-[#0B1E59] min-h-[80px] resize-y shadow-inner"
                                            placeholder="어떤 부분이 부족했는지, 왜 수정했는지 간략히 적어주세요."
                                        />
                                    </div>

                                    <div className="flex justify-end mt-2">
                                        {feedbackSuccess ? (
                                            <span className="text-sm bg-green-100 text-green-700 border border-green-200 font-bold px-4 py-2 rounded-xl">
                                                ✅ 피드백이 저장되었습니다!
                                            </span>
                                        ) : (
                                            <button
                                                onClick={submitFeedback}
                                                disabled={feedbackSubmitting}
                                                className="px-6 py-2.5 bg-gradient-to-r from-[#0B1E59] to-blue-800 hover:from-[#081745] hover:to-blue-700 text-white rounded-xl shadow-lg shadow-[#0B1E59]/20 text-sm font-bold active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all"
                                            >
                                                {feedbackSubmitting ? '저장 중...' : '저장하기'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}


                </section>
            </main>
        </div>
    )
}
