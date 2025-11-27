import express from 'express'
import { addMember, getUserWorkspaces, syncWorkspace } from '../controllers/workspaceControllers.js' // Import syncWorkspace

const workspaceRouter = express.Router() 

workspaceRouter.get('/' , getUserWorkspaces)
workspaceRouter.post('/add-member' ,addMember )
workspaceRouter.post('/sync', syncWorkspace) // <--- Add this line

export default workspaceRouter