import express from "express"
import { createTask, deleteTask, updateTask } from "../controllers/taskController.js"


const tastRouter = express.Router()


tastRouter.post('/' , createTask)
tastRouter.put('/:id' , updateTask)
tastRouter.post('/delete' ,deleteTask)

export default tastRouter