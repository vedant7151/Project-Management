/* eslint-disable no-unused-vars */
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
} from "@clerk/clerk-react";
import { fetchWorkspaces } from "../features/workspaceSlice";

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { loading, workspaces } = useSelector((state) => state.workspace);
  const dispatch = useDispatch();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  // Initial load of theme
  useEffect(() => {
    dispatch(loadTheme());
  }, []);

  //Initial load of workspace
  useEffect(() => {
    if (isLoaded && user && workspaces.length === 0) {
      console.log('Attempting to fetch workspaces on initial load');
      dispatch(fetchWorkspaces({ getToken }));
    }
  }, [user, isLoaded]);

  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen bg-white dark:bg-zinc-950">
        <SignIn />
      </div>
    );
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-zinc-950">
        <Loader2Icon className="size-7 text-blue-500 animate-spin" />
      </div>
    );

  // in Layout return area where you render CreateOrganization
  if (user && workspaces.length === 0) {
    const onCreated = async () => {
      try {
        console.log('Organization created, waiting for workspace creation...');
        // Add a small delay to allow the webhook to process the organization creation
        setTimeout(async () => {
          console.log('Attempting to fetch workspaces after organization creation');
          try {
            const token = await getToken();
            console.log('Token obtained:', token ? 'Token exists' : 'No token');
            dispatch(fetchWorkspaces({ getToken }));
          } catch (tokenError) {
            console.error('Error getting token:', tokenError);
            // Retry after another delay
            setTimeout(() => {
              console.log('Retrying workspace fetch...');
              dispatch(fetchWorkspaces({ getToken }));
            }, 3000);
          }
        }, 2000);
      } catch (e) {
        console.error('Error in onCreated:', e);
      }
    };

    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="flex flex-col items-center space-y-4">
          <CreateOrganization onCreated={onCreated} />
          <button 
            onClick={() => {
              console.log('Manual workspace fetch triggered');
              dispatch(fetchWorkspaces({ getToken }));
            }}
            className="text-sm text-blue-500 hover:text-blue-600 underline"
          >
            Refresh Workspaces
          </button>
        </div>
      </div>
    );
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
