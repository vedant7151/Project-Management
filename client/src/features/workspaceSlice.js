/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { dummyWorkspaces } from "../assets/assets";
import api from "../configs/api";

export const fetchWorkspaces = createAsyncThunk('workspace/fetchWorkspaces', async ({ getToken }) => {
    try {
        const token = await getToken();
        console.log('Fetching workspaces with token:', token ? 'Token exists' : 'No token');

        const { data } = await api.get('/api/workspaces', {
            // Fixed: Added backticks for template literal
            headers: { Authorization: `Bearer ${await getToken()}` }
        });

        console.log('Workspaces fetched successfully:', data.workspaces?.length || 0, 'workspaces');
        return data.workspaces || [];
    } catch (error) {
        console.error('Error fetching workspaces:', error?.response?.status, error?.response?.data || error.message);
        return [];
    }
});

const initialState = {
    workspaces: [],
    currentWorkspace: null,
    loading: false,
};

const workspaceSlice = createSlice({
    name: "workspace",
    initialState,
    reducers: {
        setWorkspaces: (state, action) => {
            state.workspaces = action.payload;
        },
        setCurrentWorkspace: (state, action) => {
            localStorage.setItem("currentWorkspaceId", action.payload);
            state.currentWorkspace = state.workspaces.find((w) => w.id === action.payload);
        },
        addWorkspace: (state, action) => {
            state.workspaces.push(action.payload);

            // set current workspace to the new workspace
            if (state.currentWorkspace?.id !== action.payload.id) {
                state.currentWorkspace = action.payload;
            }
        },
        updateWorkspace: (state, action) => {
            state.workspaces = state.workspaces.map((w) =>
                w.id === action.payload.id ? action.payload : w
            );

            // if current workspace is updated, set it to the updated workspace
            if (state.currentWorkspace?.id === action.payload.id) {
                state.currentWorkspace = action.payload;
            }
        },
        deleteWorkspace: (state, action) => {
            // Note: Ensure your workspace objects consistently use '_id' or 'id'
            state.workspaces = state.workspaces.filter((w) => w._id !== action.payload);
        },
        addProject: (state, action) => {
            if (state.currentWorkspace) {
                state.currentWorkspace.projects.push(action.payload);
                
                // Update the workspace in the main list to reflect the change
                const workspaceIndex = state.workspaces.findIndex(w => w.id === state.currentWorkspace.id);
                if (workspaceIndex !== -1) {
                    state.workspaces[workspaceIndex] = state.currentWorkspace;
                }
            }
        },
        addTask: (state, action) => {
            if (state.currentWorkspace) {
                // Update current workspace projects
                state.currentWorkspace.projects = state.currentWorkspace.projects.map((p) => {
                    if (p.id === action.payload.projectId) {
                        // Create a new array reference to ensure immutability detection if needed
                        return { ...p, tasks: [...p.tasks, action.payload] };
                    }
                    return p;
                });

                // Sync with main workspaces list
                const workspaceIndex = state.workspaces.findIndex(w => w.id === state.currentWorkspace.id);
                if (workspaceIndex !== -1) {
                    state.workspaces[workspaceIndex] = state.currentWorkspace;
                }
            }
        },
        updateTask: (state, action) => {
            if (state.currentWorkspace) {
                state.currentWorkspace.projects = state.currentWorkspace.projects.map((p) => {
                    if (p.id === action.payload.projectId) {
                        p.tasks = p.tasks.map((t) =>
                            t.id === action.payload.id ? action.payload : t
                        );
                    }
                    return p;
                });

                // Sync with main workspaces list
                const workspaceIndex = state.workspaces.findIndex(w => w.id === state.currentWorkspace.id);
                if (workspaceIndex !== -1) {
                    state.workspaces[workspaceIndex] = state.currentWorkspace;
                }
            }
        },
        deleteTask: (state, action) => {
            if (state.currentWorkspace) {
                state.currentWorkspace.projects = state.currentWorkspace.projects.map((p) => {
                    // Check if the project matches the one in the payload
                    // Assuming action.payload contains { projectId, taskId/taskIds }
                    if (p.id === action.payload.projectId) {
                         // Assuming action.payload is an array of IDs to delete based on your .includes logic
                        p.tasks = p.tasks.filter((t) => !action.payload.includes(t.id));
                    }
                    return p;
                });

                // Sync with main workspaces list
                const workspaceIndex = state.workspaces.findIndex(w => w.id === state.currentWorkspace.id);
                if (workspaceIndex !== -1) {
                    state.workspaces[workspaceIndex] = state.currentWorkspace;
                }
            }
        }
    },

    extraReducers: (builder) => {
        builder.addCase(fetchWorkspaces.pending, (state) => {
            state.loading = true;
        });

        builder.addCase(fetchWorkspaces.fulfilled, (state, action) => {
            state.workspaces = action.payload;

            if (action.payload.length > 0) {
                const localStorageCurrentWorkspaceId = localStorage.getItem('currentWorkspaceId');

                if (localStorageCurrentWorkspaceId) {
                    const findWorkspace = action.payload.find((w) => w.id === localStorageCurrentWorkspaceId);

                    if (findWorkspace) {
                        state.currentWorkspace = findWorkspace;
                    } else {
                        state.currentWorkspace = action.payload[0];
                    }
                } else {
                    state.currentWorkspace = action.payload[0];
                }
            }
            state.loading = false;
        });

        builder.addCase(fetchWorkspaces.rejected, (state) => {
            state.loading = false;
        });
    }
});

export const { 
    setWorkspaces, 
    setCurrentWorkspace, 
    addWorkspace, 
    updateWorkspace, 
    deleteWorkspace, 
    addProject, 
    addTask, 
    updateTask, 
    deleteTask 
} = workspaceSlice.actions;

export default workspaceSlice.reducer;