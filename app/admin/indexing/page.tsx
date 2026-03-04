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
        <div className="max-w-4xl mx-auto py-8 px-4">
            {/* Back to Admin Button */}
            <div className="mb-6">
                <Link
                    href="/admin"
                    className="inline-flex items-center text-gray-500 hover:text-blue-600 transition-colors font-medium text-sm group"
                >
                    <svg className="w-4 h-4 mr-1 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    Back to Admin
                </Link>
            </div>

            <h1 className="text-2xl font-bold mb-6 text-gray-800">PDF Indexing</h1>

            <div className="max-w-2xl mx-auto">
                <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-5">

                    <h2 className="text-lg font-semibold text-gray-700 mb-2">Upload New Document</h2>

                    {/* Document Title */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Document Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="e.g. Chapter 1 - Introduction"
                            required
                        />
                    </div>

                    {/* Course Metadata Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Course Key <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={courseKey}
                                onChange={handleKeyChange}
                                className={`w-full px-4 py-2 border rounded-lg outline-none transition-all
                                    ${keyError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300'}`}
                                placeholder="예: grammar_basic"
                                required
                            />
                            {keyError && <p className="text-xs text-red-500 mt-1">{keyError}</p>}
                            <p className="text-xs text-gray-500 mt-1">시스템 구분 기준입니다. (예: grammar_basic)</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Course Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={courseName}
                                onChange={e => setCourseName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                placeholder="예: 기초 문법"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">질문 검색 시 표시되는 강좌명입니다.</p>
                        </div>
                    </div>

                    {/* File Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            PDF File <span className="text-red-500">*</span>
                        </label>
                        <div className="flex items-center justify-center w-full">
                            <label
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                                    ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                            >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <svg className={`w-8 h-8 mb-3 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                    <p className="text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                    <p className="text-xs text-gray-500">PDF (MAX. 50MB)</p>
                                </div>
                                <input id="file-upload" type="file" className="hidden" accept=".pdf" onChange={handleFileChange} required={!file} />
                            </label>
                        </div>
                        {file && (
                            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md w-fit">
                                <span>📄 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                <button
                                    type="button"
                                    onClick={handleClearFile}
                                    className="text-blue-400 hover:text-red-500 transition-colors p-1"
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
                        className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all shadow-md hover:shadow-lg
                            ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:transform active:scale-[0.98]'}`}
                    >
                        {loading ? 'Uploading & Processing...' : 'Upload & Index'}
                    </button>

                    {/* Activity Log */}
                    <div className="bg-gray-900 text-gray-200 p-4 rounded-xl font-mono text-xs h-32 overflow-y-auto shadow-inner border border-gray-700">
                        <div className="flex justify-between items-center mb-1 pb-1 border-b border-gray-700">
                            <span className="font-bold text-gray-400">Activity Log</span>
                            <button onClick={() => setLogs([])} className="hover:text-white">Clear</button>
                        </div>
                        {logs.length === 0 ? <span className="text-gray-600 italic">...</span> : logs.map((log, i) => <div key={i}>{log}</div>)}
                    </div>
                </form>

                {/* Info Note */}
                <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                    <p>※ 실제 질문 검색은 <strong>Course Name</strong> 기준으로 수행됩니다. Document Title은 관리/표시용입니다.</p>
                </div>

            </div>
        </div>
    )
}
