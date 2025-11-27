import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loadTheme } from "../features/themeSlice";
import { Loader2Icon } from "lucide-react";
import {
  useUser,
  SignIn,
  useAuth,
  CreateOrganization,
  useOrganizationList // <--- 1. Import this
} from "@clerk/clerk-react";
import { fetchWorkspaces } from "../features/workspaceSlice";
import api from "../configs/api"; // <--- 2. Ensure you have your axios/api instance imported

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { loading, workspaces } = useSelector((state) => state.workspace);
  const dispatch = useDispatch();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  // 3. Get Clerk's Organization Data
  const { userMemberships, isLoaded: isOrgLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  useEffect(() => {
    dispatch(loadTheme());
  }, [dispatch]);

  // Initial load of workspace
  useEffect(() => {
    if (isLoaded && user && workspaces.length === 0) {
      dispatch(fetchWorkspaces({ getToken }));
    }
  }, [user, isLoaded, dispatch, getToken]);

  // --- 4. NEW: AUTO-SYNC LOGIC ---
  useEffect(() => {
    const syncMissingWorkspace = async () => {
        // If Clerk lists organizations... but our Database (workspaces) is empty...
        if (isLoaded && isOrgLoaded && userMemberships.count > 0 && workspaces.length === 0) {
            
            const clerkOrg = userMemberships.data[0].organization;
            console.log("⚠️ Sync Mismatch detected. Triggering manual sync for:", clerkOrg.name);

            try {
                const token = await getToken();
                // Call our new backend endpoint
                await api.post('/api/workspaces/sync', {
                    id: clerkOrg.id,
                    name: clerkOrg.name,
                    slug: clerkOrg.slug,
                    imageUrl: clerkOrg.imageUrl
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                // Wait 2 seconds for Inngest to finish, then refresh data
                setTimeout(() => {
                    console.log("♻️ Refreshing workspaces...");
                    dispatch(fetchWorkspaces({ getToken }));
                }, 2000);

            } catch (err) {
                console.error("Manual sync failed:", err);
            }
        }
    };

    syncMissingWorkspace();
  }, [isLoaded, isOrgLoaded, userMemberships, workspaces.length, getToken, dispatch]);
  // -------------------------------

  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen bg-white dark:bg-zinc-950">
        <SignIn />
      </div>
    );
  }

  // 5. Loading State: Wait for both Workspace and Clerk Data
  if (loading || !isOrgLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-zinc-950">
        <Loader2Icon className="size-7 text-blue-500 animate-spin" />
      </div>
    );
  }

  // 6. Fix the "Force Create" Logic
  // Only force creation if Clerk ALSO says you have 0 organizations
  const hasClerkOrgs = userMemberships?.count > 0;

  if (user && workspaces.length === 0 && !hasClerkOrgs) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-white dark:bg-zinc-950">
        <CreateOrganization afterCreateOrganizationUrl="/" />
      </div>
    );
  }

  // Optional: Show a "Syncing" screen if we are in that middle state
  if (workspaces.length === 0 && hasClerkOrgs) {
      return (
          <div className="flex flex-col gap-4 items-center justify-center h-screen bg-white dark:bg-zinc-950">
             <Loader2Icon className="size-8 text-blue-600 animate-spin" />
             <p className="text-zinc-500 font-medium">Syncing your workspace...</p>
          </div>
      )
  }

  return (
    <div className="flex bg-white dark:bg-zinc-950 text-gray-900 dark:text-slate-100">
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />
      <div className="flex-1 flex flex-col h-screen">
        <Navbar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
        />
        <div className="flex-1 h-full p-6 xl:p-10 xl:px-16 overflow-y-scroll">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;