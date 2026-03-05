'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INACTIVITY_LIMIT_MS = 3 * 60 * 60 * 1000 // 3 hours

export function useInactivityLogout() {
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        let timeoutId: NodeJS.Timeout

        const handleActivity = () => {
            localStorage.setItem('lastActiveTimestamp', Date.now().toString())
            resetTimer()
        }

        const checkInactivity = async () => {
            const lastActiveStr = localStorage.getItem('lastActiveTimestamp')
            if (lastActiveStr) {
                const lastActive = parseInt(lastActiveStr, 10)
                if (Date.now() - lastActive > INACTIVITY_LIMIT_MS) {
                    await supabase.auth.signOut()
                    // Clear the timestamp so it doesn't trigger repeatedly on the login page itself
                    localStorage.removeItem('lastActiveTimestamp')
                    router.push('/login?sessionExpired=true')
                    return
                }
            }
            // If not expired, keep checking
            resetTimer()
        }

        const resetTimer = () => {
            clearTimeout(timeoutId)
            timeoutId = setTimeout(checkInactivity, 60000) // Check every 1 minute
        }

        // Initialize
        localStorage.setItem('lastActiveTimestamp', Date.now().toString())
        resetTimer()

        // Event listeners
        const events = ['mousemove', 'keydown', 'click', 'scroll']
        events.forEach(event => {
            window.addEventListener(event, handleActivity)
        })

        return () => {
            clearTimeout(timeoutId)
            events.forEach(event => {
                window.removeEventListener(event, handleActivity)
            })
        }
    }, [router, supabase])
}
