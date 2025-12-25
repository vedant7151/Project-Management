import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../configs/api";

export const fetchWorkspaces = createAsyncThunk(
    'workspace/fetchWorkspaces', 
    async ({ getToken }, { rejectWithValue }) => {
        try {
            // 1. Get the token correctly first (Wait for the promise!)
            const token = await getToken(); 

            const { data } = await api.get('/api/workspaces', {
                headers: { 
                    // 2. Use the resolved token variable
                    Authorization: `Bearer ${token}` 
                }
            });
            return data.workspaces || [];
        } catch (error) {
            console.log(error);
            return rejectWithValue(error.response?.data?.message || "Failed to fetch workspaces");
        }
    }
);
const initialState = {
    workspaces: [],
    currentWorkspace: null,
    loading: false,
    error: null, // <--- ADDED THIS TO TRACK ERRORS
};

const workspaceSlice = createSlice({
    name: "workspace",
    initialState,
    reducers: {
        setWorkspaces: (state, action) => { state.workspaces = action.payload; },
        setCurrentWorkspace: (state, action) => {
            localStorage.setItem("currentWorkspaceId", action.payload);
            state.currentWorkspace = state.workspaces.find((w) => w.id === action.payload);
        },
        addWorkspace: (state, action) => {
            state.workspaces.push(action.payload);
            state.currentWorkspace = action.payload;
        },
        // ... (Keep your other reducers: updateWorkspace, deleteWorkspace, etc. here)
        // For brevity I am not repeating them, but DO NOT DELETE THEM.
    },
    extraReducers: (builder) => {
        builder.addCase(fetchWorkspaces.pending, (state) => {
            state.loading = true;
            state.error = null; // Clear previous errors
        });

        builder.addCase(fetchWorkspaces.fulfilled, (state, action) => {
            state.loading = false;
            state.workspaces = action.payload;
            state.error = null;

            // Smart Selection Logic
            if (action.payload.length > 0) {
                const savedId = localStorage.getItem('currentWorkspaceId');
                const savedWorkspace = action.payload.find((w) => w.id === savedId);
                state.currentWorkspace = savedWorkspace || action.payload[0];
            } else {
                state.currentWorkspace = null;
            }
        });

        builder.addCase(fetchWorkspaces.rejected, (state, action) => {
            state.loading = false;
            state.workspaces = []; // Ensure it's empty on failure
            state.error = action.payload; // <--- CAPTURE THE ERROR
        });
    }
});

// Export all your actions
export const { setWorkspaces, setCurrentWorkspace, addWorkspace, updateWorkspace, deleteWorkspace, addProject, addTask, updateTask, deleteTask } = workspaceSlice.actions;
export default workspaceSlice.reducer;