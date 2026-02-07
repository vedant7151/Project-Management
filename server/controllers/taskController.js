
import prisma from "../config/prisma.js"
import { inngest } from "../inngest/index.js"

//Create a new task
export const createTask = async (req, res) => {
    try {
        // 1. Use the userId attached by middleware (more reliable)
        const userId = req.userId; 
        
        const { projectId, title, description, type, status, priority, assigneeId, due_date } = req.body;

        const origin = req.get('origin');

        // 2. Fetch Project AND its Workspace to checks permissions
        // We need 'workspace' to see if the user is an Org Admin
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { 
                members: { include: { user: true } },
                workspace: { include: { members: true } } // <--- ADDED THIS
            }
        });

        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        // 3. Permission Check: Admin OR Team Lead
        const isWorkspaceAdmin = project.workspace.members.some(
            (m) => m.userId === userId && m.role === "ADMIN"
        );
        const isTeamLead = project.team_lead === userId;

        // If neither, block them
        if (!isWorkspaceAdmin && !isTeamLead) {
            return res.status(403).json({ message: "You do not have permission to create tasks in this project" });
        }

        // 4. Assignee Check
        // Ensure the person you are assigning the task to is actually in the project
        if (assigneeId) {
            const isAssigneeInProject = project.members.some(
                (member) => member.user.id === assigneeId
            );

            if (!isAssigneeInProject) {
                return res.status(403).json({ message: "Assignee is not a member of this project" });
            }
        }

        // 5. Create the Task
        const task = await prisma.task.create({
            data: {
                projectId,
                title,
                description,
                priority,
                assigneeId, 
                status,
                type, // Ensure your schema has 'type', otherwise remove this
                due_date: due_date ? new Date(due_date) : null
            }
        });

        const taskWithAssignee = await prisma.task.findUnique({
            where: { id: task.id },
            include: { assignee: true }
        });

        // 6. Send Email Notification (safely)
        try {
            await inngest.send({
                name: "app/task.assigned",
                data: {
                    taskId: task.id,
                    origin
                }
            });
        } catch (emailError) {
            console.log("Failed to queue email:", emailError);
            // Don't fail the request just because email failed
        }

        res.json({ task: taskWithAssignee, message: "Task created successfully" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message });
    }
}



// Update task - RESTRICTED TO TEAM LEAD ONLY
export const updateTask = async (req, res) => {
    try {
        const userId = req.userId; 

        const task = await prisma.task.findUnique({
            where: { id: req.params.id }
        });

        if (!task) {
            return res.status(404).json({ message: "Task Not Found" });
        }

        const project = await prisma.project.findUnique({
            where: { id: task.projectId }
        });

        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        // BLOCK NON-LEADS
        if (project.team_lead !== userId) {
            // We return 403, but with a SPECIFIC message
            return res.status(403).json({ message: "Only team lead can update the task" });
        }

        const updatedTask = await prisma.task.update({
            where: { id: req.params.id },
            data: req.body
        });

        res.json({ task: updatedTask, message: "Task updated successfully" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message });
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