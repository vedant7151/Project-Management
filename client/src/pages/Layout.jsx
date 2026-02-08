/* eslint-disable react-hooks/exhaustive-deps */
 
import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { Outlet } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { loadTheme } from '../features/themeSlice'
import { Loader2Icon, AlertCircle } from 'lucide-react'
import { useUser, SignIn, useAuth, CreateOrganization, useOrganizationList } from '@clerk/clerk-react'
import { fetchWorkspaces } from '../features/workspaceSlice'

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    
    // 1. EXTRACT 'error', 'isFetched' FROM REDUX STATE
    const { loading, workspaces, error, isFetched } = useSelector((state) => state.workspace)
    
    const dispatch = useDispatch()
    const { user, isLoaded } = useUser()
    const { getToken } = useAuth()

    const { userMemberships, isLoaded: isOrgLoaded } = useOrganizationList({
        userMemberships: { infinite: true },
    });

    // Initial load of theme
    useEffect(() => {
        dispatch(loadTheme())
    }, [dispatch])

    // 2. SMART FETCH LOGIC (BREAKS THE LOOP)
    useEffect(() => {
        // Wait for Clerk to load
        if (!isLoaded || !isOrgLoaded || !user) return;

        // FETCH CONDITION:
        // 1. Redux is empty
        // 2. We are NOT currently loading
        // 3. We do NOT have a previous error (This stops the infinite loop!)
        // 4. Clerk says we actually have organizations to fetch
        // 5. We haven't fetched yet (prevents infinite loop if DB and Clerk are out of sync)
        if (workspaces.length === 0 && !loading && !error && userMemberships.count > 0 && !isFetched) {
            dispatch(fetchWorkspaces({ getToken }))
        }
    }, [
        user?.id, 
        isLoaded, 
        isOrgLoaded, 
        workspaces.length, 
        loading, 
        error, // Added error to dependencies
        userMemberships.count, 
        dispatch,
        isFetched, // Added isFetched to dependencies
        getToken
    ])

    // --- RENDER STATES ---

    // A. Not Logged In
    if (!user) {
        return (
            <div className='flex justify-center items-center h-screen bg-white dark:bg-zinc-950'>
                <SignIn />
            </div>
        )
    }

    // B. ERROR STATE (New!) - Shows the error instead of spinning forever
    if (error) {
        return (
            <div className='flex flex-col items-center justify-center h-screen bg-white dark:bg-zinc-950 text-red-500'>
                <AlertCircle className="size-12 mb-4" />
                <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                <button 
                    onClick={() => window.location.reload()} 
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                    Retry Connection
                </button>
            </div>
        )
    }

    // C. Loading State
    if (loading) {
        return (
            <div className='flex items-center justify-center h-screen bg-white dark:bg-zinc-950'>
                <Loader2Icon className="size-7 text-blue-500 animate-spin" />
            </div>
        )
    }

    // D. No Organizations Found -> Create New
    if (isOrgLoaded && userMemberships.count === 0 && workspaces.length === 0) {
        return (
            <div className='min-h-screen flex justify-center items-center bg-white dark:bg-zinc-950'>
                <CreateOrganization skipInvitationScreen afterCreateOrganizationUrl='/' />
            </div>
        )
    }

    // E. Main Application
    return (
        <div className="flex bg-white dark:bg-zinc-950 text-gray-900 dark:text-slate-100">
            <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
            <div className="flex-1 flex flex-col h-screen">
                <Navbar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
                <div className="flex-1 h-full p-6 xl:p-10 xl:px-16 overflow-y-scroll">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

export default Layout