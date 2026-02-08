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
    isFetched: false, // Prevents infinite refetching
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
      state.currentWorkspace = state.workspaces.find(
        (w) => w.id === action.payload
      );
    },

    addWorkspace: (state, action) => {
      state.workspaces.push(action.payload);

      if (state.currentWorkspace?.id !== action.payload.id) {
        state.currentWorkspace = action.payload;
      }
    },

    updateWorkspace: (state, action) => {
      state.workspaces = state.workspaces.map((w) =>
        w.id === action.payload.id ? action.payload : w
      );

      if (state.currentWorkspace?.id === action.payload.id) {
        state.currentWorkspace = action.payload;
      }
    },

    deleteWorkspace: (state, action) => {
      state.workspaces = state.workspaces.filter(
        (w) => w._id !== action.payload
      );
    },

    addProject: (state, action) => {
      state.currentWorkspace.projects.push(action.payload);

      state.workspaces = state.workspaces.map((w) =>
        w.id === state.currentWorkspace.id
          ? { ...w, projects: w.projects.concat(action.payload) }
          : w
      );
    },

    addTask: (state, action) => {
      state.currentWorkspace.projects = state.currentWorkspace.projects.map(
        (p) => {
          if (p.id === action.payload.projectId) {
            p.tasks.push(action.payload);
          }
          return p;
        }
      );

      state.workspaces = state.workspaces.map((w) =>
        w.id === state.currentWorkspace.id
          ? {
              ...w,
              projects: w.projects.map((p) =>
                p.id === action.payload.projectId
                  ? { ...p, tasks: p.tasks.concat(action.payload) }
                  : p
              ),
            }
          : w
      );
    },

    updateTask: (state, action) => {
      state.currentWorkspace.projects.forEach((p) => {
        if (p.id === action.payload.projectId) {
          p.tasks = p.tasks.map((t) =>
            t.id === action.payload.id ? action.payload : t
          );
        }
      });

      state.workspaces = state.workspaces.map((w) =>
        w.id === state.currentWorkspace.id
          ? {
              ...w,
              projects: w.projects.map((p) =>
                p.id === action.payload.projectId
                  ? {
                      ...p,
                      tasks: p.tasks.map((t) =>
                        t.id === action.payload.id ? action.payload : t
                      ),
                    }
                  : p
              ),
            }
          : w
      );
    },

    deleteTask: (state, action) => {
      state.currentWorkspace.projects.forEach((p) => {
        p.tasks = p.tasks.filter(
          (t) => !action.payload.includes(t.id)
        );
      });

      state.workspaces = state.workspaces.map((w) =>
        w.id === state.currentWorkspace.id
          ? {
              ...w,
              projects: w.projects.map((p) =>
                p.id === action.payload.projectId
                  ? {
                      ...p,
                      tasks: p.tasks.filter(
                        (t) => !action.payload.includes(t.id)
                      ),
                    }
                  : p
              ),
            }
          : w
      );
    },
  },

  extraReducers: (builder) => {
    builder.addCase(fetchWorkspaces.pending, (state) => {
      state.loading = true;
    });

    builder.addCase(fetchWorkspaces.fulfilled, (state, action) => {
      state.workspaces = action.payload;
      state.isFetched = true; // Mark as fetched

      if (action.payload.length > 0) {
        const storedId = localStorage.getItem("currentWorkspaceId");

        if (storedId) {
          const found = action.payload.find((w) => w.id == storedId);
          state.currentWorkspace = found || action.payload[0];
        } else {
          state.currentWorkspace = action.payload[0];
        }
      }

      state.loading = false;
    });

    builder.addCase(fetchWorkspaces.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });
  },
});

// Export all your actions
export const { setWorkspaces, setCurrentWorkspace, addWorkspace, updateWorkspace, deleteWorkspace, addProject, addTask, updateTask, deleteTask } = workspaceSlice.actions;
export default workspaceSlice.reducer;