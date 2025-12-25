
import prisma from "../config/prisma.js"
import { inngest } from "../inngest/index.js"

//Create a new task
export const createTask = async(req,res) =>{
    try {
        const {userId} = await req.auth()
        const {projectId , title , description , type , 
            status, priority , assigneeId, due_date} = req.body

        const origin = req.get('origin')

        //Check if user has admin role for projects
        const project = await prisma.project.findUnique({
            where : {id : projectId},
            include : {members : {include : {user : true}}}
        
        })

        if(!project){
            return res.status(404).json({message : "Project not found"})
        }else if (project.team_lead !== userId) {
            return res.status(403).json({message : "You do not have admin rights for this project"})
        } else if (assigneeId && !project.members.find((member) => member.user.id === assigneeId)) {
            return res.status(403).json({message : "Assignne is not a member of the project / workspace"})
        }


        const task = await prisma.task.create({
            data : {
                projectId,
                title,
                description,
                priority,
                assigneeId,
                status,
                due_date : new Date(due_date)
            }
        })

        const taskWithAssignee = await prisma.task.findUnique({
            where : {id : task.id},
            include : {assignee : true}


        })

        //Send email
        await inngest.send({
            name : "app/task.assigned",
            data : {
                taskId : task.id,
                origin
            }
        })

        res.json({task : taskWithAssignee , message : "Task createed successfully"})



    } catch (error) {
        console.log(error)
        return res.status(500).json({message : error.code || error.message})
    }
}



//Update task
export const updateTask = async(req,res) =>{
    try {

        const task = await prisma.task.findUnique({
            where : {id : req.params.id}
        })


        if(!task){
            return res.status(404).json({message : "Task Not Found"})
        }
       
        const {userId} = await req.auth()
        
        
        const project = await prisma.project.findUnique({
            where : {id : task.projectId},
            include : {members : {include : {user : true}}}
        
        })

        if(!project){
            return res.status(404).json({message : "Project not found"})
        }else if (project.team_lead !== userId) {
            return res.status(403).json({message : "You do not have admin rights for this project"})
        } 

        const updatedTask  = await prisma.task.update({
            where : {id : req.params.id},
            data : req.body
        })

        res.json({task : updatedTask , message : "Task updated successfully"})



    } catch (error) {
        console.log(error)
        return res.status(500).json({message : error.code || error.message})
    }
}


//Delete task
export const deleteTask = async(req,res) =>{
    try {

       
        const {userId} = await req.auth()
        const {taskId} = await req.body
        const tasks = await prisma.task.findMany({
            where : {id : {in : taskId}}
        })


        if(!tasks.length === 0){
            return res.status(404).json({message : "Task not found"})
        }
        
        const project = await prisma.project.findUnique({
            where : {id : tasks[0].projectId},
            include : {members : {include : {user : true}}}
        
        })

        if(!project){
            return res.status(404).json({message : "Project not found"})
        }else if (project.team_lead !== userId) {
            return res.status(403).json({message : "You do not have admin rights for this project"})
        } 

        await prisma.task.deleteMany({
            where : {id : {in : taskId}}
        })
        res.json({ message : "Task deleted successfully"})

    } catch (error) {
        console.log(error)
        return res.status(500).json({message : error.code || error.message})
    }
}