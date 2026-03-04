'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                            K
                        </div>
                        <h1 className="text-xl font-semibold text-gray-800 tracking-tight">KissEng Assistant</h1>
                    </div>
                    {/* Back to Admin Label - Only visible if Admin */}
                    {isAdmin && (
                        <Link
                            href="/admin"
                            className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors flex items-center gap-1"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                            Back to Admin
                        </Link>
                    )}
                </div>
                <button
                    onClick={handleLogout}
                    className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                    Sign Out
                </button>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Left Column: Input */}
                <section className="flex flex-col gap-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[60vh] transition-all overflow-hidden">

                        {/* Course Selector Header */}
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Course Context</label>
                                {courseError && <span className="text-xs text-red-500 font-medium">{courseError}</span>}
                            </div>
                            <div className="relative">
                                <select
                                    value={selectedCourse}
                                    onChange={handleCourseChange}
                                    disabled={loadingCourses}
                                    className="appearance-none w-full bg-white border border-gray-300 text-gray-700 py-2 pl-3 pr-8 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer disabled:bg-gray-100 disabled:text-gray-400"
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
                            className="flex-1 w-full p-6 resize-none focus:outline-none text-gray-700 placeholder-gray-400 text-lg leading-relaxed"
                            placeholder="Enter the student's question here..."
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                        />
                        <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-white">
                            <span className={`text-xs ${question.trim().length === 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                {question.length} chars {question.trim().length === 0 && '(Required)'}
                            </span>
                            <div className="flex items-center gap-3">
                                {loading && (
                                    <span className="text-xs font-medium text-blue-600 animate-pulse">
                                        {loadingMessage}
                                    </span>
                                )}
                                <button
                                    onClick={handleGenerate}
                                    disabled={loading || !question.trim()}
                                    className={`px-8 py-2.5 rounded-lg font-medium text-white transition-all shadow-sm
                                        ${loading || !question.trim()
                                            ? 'bg-blue-300 cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md active:transform active:scale-95'
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
                    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[400px] transition-all ${loading ? 'opacity-70 pointer-events-none' : ''}`}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Answer Draft</span>
                                {selectedCourse && (
                                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                                        {selectedCourseName}
                                    </span>
                                )}
                                {showLowConfidenceWarning && (
                                    <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded border border-orange-200">
                                        참고 페이지 부족
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {originalAnswer && answer !== originalAnswer && (
                                    <button
                                        onClick={resetToDraft}
                                        className="text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors"
                                    >
                                        Reverse Changes
                                    </button>
                                )}
                                <button
                                    onClick={copyToClipboard}
                                    disabled={!answer}
                                    className={`text-xs font-medium px-3 py-1.5 rounded transition-all disabled:opacity-50
                                        ${copied
                                            ? 'bg-green-100 text-green-700'
                                            : 'text-blue-600 hover:bg-blue-50'
                                        }`}
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                                <button
                                    onClick={clearAll}
                                    className="text-xs font-medium text-gray-500 hover:bg-gray-100 px-3 py-1.5 rounded transition-colors"
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
                            className="w-full p-6 focus:outline-none text-gray-800 leading-relaxed text-base min-h-[300px] resize-y overflow-y-auto"
                            placeholder="Generated answer will appear here..."
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                        />
                    </div>

                    {/* Content References */}
                    {(!lowConfidence && references.length > 0) && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl flex justify-between items-center">
                                <h3 className="text-sm font-semibold text-gray-700">Textbook References</h3>
                                <div className="text-xs text-gray-400">
                                    {references.length} pages
                                </div>
                            </div>
                            <div className="p-4">
                                <div className="flex flex-col gap-4">
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
                                            <div key={i} className="flex flex-col gap-2 mb-4 last:mb-0">
                                                <div className="text-sm font-semibold text-gray-800">
                                                    {group.title} <span className="text-gray-500 font-normal">({group.courseKey || 'All Courses'})</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    {group.pages.map((p, j) => (
                                                        <div key={j} className="text-sm text-gray-600 flex gap-2 items-start py-1 border-b border-gray-50 last:border-0">
                                                            <span className="font-bold min-w-[2.5rem] shrink-0 text-blue-700">p.{p.page}</span>
                                                            <span className="text-gray-500 flex-1 leading-snug break-all sm:break-normal">→ {p.highlightText || '내용 요약 없음'}</span>
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
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-2 flex-shrink-0">
                            {!feedbackVisible ? (
                                <button
                                    onClick={() => {
                                        setFinalAnswer(answer);
                                        setFeedbackVisible(true);
                                        setFeedbackSuccess(false);
                                    }}
                                    className="w-full text-center py-3 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    조교 피드백 작성하기
                                </button>
                            ) : (
                                <div className="p-4 border-t border-gray-100 bg-gray-50 transition-all flex flex-col gap-4">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-sm font-bold text-gray-700">답변 평가 및 수정</h3>
                                        <button onClick={() => setFeedbackVisible(false)} className="text-gray-400 hover:text-gray-600 text-sm">
                                            닫기
                                        </button>
                                    </div>

                                    {/* Edited Answer */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                            조교 최종 답안 (핵심 정리 + 설명)
                                        </label>
                                        <textarea
                                            value={finalAnswer}
                                            onChange={(e) => setFinalAnswer(e.target.value)}
                                            className="w-full text-sm p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-h-[150px] resize-y overflow-y-auto"
                                            placeholder="학생에게 노출될 이상적인 답안 형태로 수정해주세요."
                                        />
                                    </div>

                                    {/* Comment */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                            코멘트 (개발자/관리자 참고용)
                                        </label>
                                        <textarea
                                            value={feedbackComment}
                                            onChange={(e) => setFeedbackComment(e.target.value)}
                                            className="w-full text-sm p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-h-[80px] resize-y"
                                            placeholder="어떤 부분이 부족했는지, 왜 수정했는지 간략히 적어주세요."
                                        />
                                    </div>

                                    <div className="flex justify-end mt-2">
                                        {feedbackSuccess ? (
                                            <span className="text-sm text-green-600 font-bold px-4 py-2">
                                                ✅ 피드백이 저장되었습니다!
                                            </span>
                                        ) : (
                                            <button
                                                onClick={submitFeedback}
                                                disabled={feedbackSubmitting}
                                                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
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
