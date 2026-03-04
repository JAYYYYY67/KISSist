'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function IndexingPage() {
    const [title, setTitle] = useState('')
    const [courseKey, setCourseKey] = useState('')
    const [courseName, setCourseName] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [logs, setLogs] = useState<string[]>([])

    // Drag & Drop State
    const [isDragging, setIsDragging] = useState(false)

    // Validation State
    const [keyError, setKeyError] = useState('')

    // Check key validity
    const isValidKey = (key: string) => /^[a-z0-9_]+$/.test(key)

    const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setCourseKey(val)
        if (val && !isValidKey(val)) {
            setKeyError('Course Key는 소문자 영문, 숫자, 언더바(_)만 사용할 수 있습니다.')
        } else {
            setKeyError('')
        }
    }


    // Check for drag support but we implement manual handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0]
            if (droppedFile.type === 'application/pdf') {
                setFile(droppedFile)
            } else {
                alert('Only PDF files are allowed.')
            }
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
        }
    }

    // Fetch documents

    const handleClearFile = () => {
        setFile(null)
        const fileInput = document.getElementById('file-upload') as HTMLInputElement
        if (fileInput) fileInput.value = ''
    }


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!file || !title || !courseKey || !courseName || keyError) return

        if (!isValidKey(courseKey)) {
            setKeyError('Course Key는 소문자 영문, 숫자, 언더바(_)만 사용할 수 있습니다.')
            return
        }

        setLoading(true)
        setLogs(prev => [...prev, `🚀 Starting upload: ${title} (${file.name})...`])

        const formData = new FormData()
        formData.append('title', title)
        formData.append('courseKey', courseKey)
        formData.append('courseName', courseName)
        formData.append('file', file)

        try {
            const res = await fetch('/api/admin/index-pdf', {
                method: 'POST',
                body: formData,
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Upload failed')
            }

            setLogs(prev => [...prev, `✅ Success! Document ID: ${data.id}`, `📄 Chunks: ${data.chunks}`])
            // Clear form
            setTitle('')
            setCourseKey('')
            setCourseName('')
            setFile(null)
            // Reset file input manually
            const fileInput = document.getElementById('file-upload') as HTMLInputElement
            if (fileInput) fileInput.value = ''


        } catch (err: any) {
            setLogs(prev => [...prev, `❌ Error: ${err.message}`])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="font-sans bg-[#f6f6f8] text-slate-900 min-h-screen relative overflow-hidden flex flex-col dark:bg-[#161121] dark:text-slate-100">
            {/* Abstract Background Elements */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#5417cf]/20 blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-900/30 blur-[150px]"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-br from-[#161121] via-[#161121] to-[#201633] opacity-0 dark:opacity-100 transition-opacity"></div>
            </div>

            <main className="relative z-10 flex-1 max-w-4xl mx-auto w-full py-8 px-4">
                {/* Back to Admin Button */}
                <div className="mb-6">
                    <Link
                        href="/admin"
                        className="inline-flex items-center text-slate-500 hover:text-[#5417cf] dark:hover:text-[#8253f0] transition-colors font-bold text-sm group"
                    >
                        <svg className="w-4 h-4 mr-1 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                        </svg>
                        Back to Admin
                    </Link>
                </div>

                <h1 className="text-2xl font-bold mb-6 text-slate-800 dark:text-slate-100">PDF Indexing</h1>

                <div className="max-w-2xl mx-auto">
                    <form onSubmit={handleSubmit} className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-xl p-6 md:p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700/50 space-y-6">

                        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2 border-b border-slate-200 dark:border-slate-700/50 pb-3">Upload New Document</h2>

                        {/* Document Title */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                                Document Title <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white dark:bg-[#161121]/50 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#5417cf]/50 focus:border-[#5417cf] outline-none transition-all dark:text-slate-100"
                                placeholder="e.g. Chapter 1 - Introduction"
                                required
                            />
                        </div>

                        {/* Course Metadata Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    Course Key <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={courseKey}
                                    onChange={handleKeyChange}
                                    className={`w-full px-4 py-2.5 bg-white dark:bg-[#161121]/50 border rounded-xl outline-none transition-all dark:text-slate-100
                                    ${keyError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-300 dark:border-slate-700 focus:ring-[#5417cf]/50 focus:border-[#5417cf]'}`}
                                    placeholder="예: grammar_basic"
                                    required
                                />
                                {keyError && <p className="text-xs text-red-500 font-bold mt-1.5">{keyError}</p>}
                                <p className="text-[11px] text-slate-500 mt-1.5">시스템 구분 기준입니다. (예: grammar_basic)</p>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    Course Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={courseName}
                                    onChange={e => setCourseName(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-[#161121]/50 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#5417cf]/50 focus:border-[#5417cf] outline-none transition-all dark:text-slate-100"
                                    placeholder="예: 기초 문법"
                                    required
                                />
                                <p className="text-[11px] text-slate-500 mt-1.5">질문 검색 시 표시되는 강좌명입니다.</p>
                            </div>
                        </div>

                        {/* File Upload */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                                PDF File <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center justify-center w-full mt-2">
                                <label
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-2xl cursor-pointer transition-all
                                    ${isDragging ? 'border-[#5417cf] bg-[#5417cf]/10 scale-[1.02]' : 'border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
                                >
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <svg className={`w-10 h-10 mb-3 ${isDragging ? 'text-[#5417cf]' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                        <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-bold">Click to upload</span> or drag and drop</p>
                                        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium tracking-wide mt-1">PDF (MAX. 50MB)</p>
                                    </div>
                                    <input id="file-upload" type="file" className="hidden" accept=".pdf" onChange={handleFileChange} required={!file} />
                                </label>
                            </div>
                            {file && (
                                <div className="mt-3 flex items-center gap-2 text-sm font-bold text-[#5417cf] bg-[#5417cf]/10 dark:text-[#8253f0] dark:bg-[#5417cf]/20 pl-4 py-2 rounded-xl w-fit shadow-sm border border-[#5417cf]/20">
                                    <span>📄 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                    <button
                                        type="button"
                                        onClick={handleClearFile}
                                        className="text-slate-400 hover:text-red-500 bg-white/50 dark:bg-[#161121]/50 rounded-lg p-1.5 ml-2 transition-colors mr-1 cursor-pointer"
                                        title="Remove file"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-3.5 px-4 rounded-xl font-bold text-white transition-all shadow-lg mt-2
                            ${loading ? 'bg-slate-400 dark:bg-slate-600 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-[#5417cf] to-indigo-600 hover:from-[#4914b5] hover:to-indigo-500 shadow-[#5417cf]/30 active:scale-[0.98]'}`}
                        >
                            {loading ? 'Uploading & Processing...' : 'Upload & Index'}
                        </button>

                        {/* Activity Log */}
                        <div className="bg-[#161121] text-indigo-200 p-5 rounded-2xl font-mono text-xs h-36 overflow-y-auto shadow-inner border border-slate-700/50 mt-4 leading-relaxed tracking-tight">
                            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-700/50">
                                <span className="font-bold text-slate-300">Activity Log / Console</span>
                                <button type="button" onClick={() => setLogs([])} className="hover:text-white font-bold bg-slate-800 px-2 py-0.5 rounded text-[10px] border border-slate-600 transition-colors">Clear</button>
                            </div>
                            {logs.length === 0 ? <span className="text-slate-600 italic">No activity yet...</span> : logs.map((log, i) => <div key={i}>{log}</div>)}
                        </div>
                    </form>

                    {/* Info Note */}
                    <div className="mt-6 p-4 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/50 rounded-xl text-sm text-slate-600 dark:text-slate-400 font-medium">
                        <p>※ 실제 질문 검색은 <strong className="text-slate-800 dark:text-slate-200">Course Name</strong> 기준으로 수행됩니다. Document Title은 관리/표시용입니다.</p>
                    </div>
                </div>

            </main>
        </div>
    )
}
