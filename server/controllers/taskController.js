import prisma from "../config/prisma.js";
import { inngest } from "../inngest/index.js";


//Create a new Taask
export const createTask = async (req, res) => {
  try {
    const { userId } = await req.auth();
    const {
      projectId,
      title,
      description,
      type,
      status,
      priority,
      assigneeId,
      due_date,
    } = req.body;

    const origin = req.get('origin')

    //Check if user has admin role for project
    const project = await prisma.project.findUnique({
        where : {id : projectId},
        include : {members : {include : {user : true}}}
    })

    if(!project){
        return res.status(404).json({message : "Project not found"})
    }else if(project.team_lead !== userId){
        return res.status(404).json({message : "You do not have Admin rights"})
    } else if (assigneeId && !project.members.find((member)=>member.user.id === assigneeId)) {
        return res.status(404).json({message : "Assignee is not the member of project"})
    }

    const task = await prisma.task.create({
        data : {
            projectId ,
            title,
            description,
            priority,
            assigneeId,
            status,
            due_date : new Date(due_date)
        }
    })

    const taskWithAssignee = await prisma.task.findUnique({
        where  : {id : task.id},
        include : {assignee : true}
    })

    await inngest.send({
      name : "app/task-assigned",
      data : {
        taskid: task.id , origin
      }
    })

    res.json({task : taskWithAssignee , message : "Task created Successfully"})

  } catch (error) {
    console.log(error)
    return res.status(500).json({message: "Task created Successfully"})
  }
};


//Update Task
export const updateTask = async (req, res) => {
  try {
    
    const { userId } = await req.auth();

    const task = await prisma.task.findUnique({
        where : {id : req.params.id}
    })

    if (!task) {
        return res.status(404).json({message: "Task not found"})
    }


    const project = await prisma.project.findUnique({
        where : {id : currTask.projectId},
        include : {members : {include : {user : true}}}
    })

    if(!project){
        return res.status(404).json({message : "Project not found"})
    }else if(project.team_lead !== userId){
        return res.status(404).json({message : "You do not have Admin rights"})
    } 

    const updatedTask = await prisma.task.update({
        where : {id : req.params.id},
        data : req.body
    })

    

    res.json({task :  updatedTask , message : "Task updated Successfully"})

  } catch (error) {
    console.log(error)
    return res.status(500).json({message: error.code || error.message})
  }
};



//delete task
export const deleteTask = async (req, res) => {
  try {
    
    const { userId } = await req.auth();
    const {taskIds} = req.body

    const tasks = await prisma.task.findMany({
        where : {id : {in : taskIds}}
    })

    if(tasks.length == 0){
        return res.status(404).json({message : "Task not found"})
    }

    
    
    const project = await prisma.project.findUnique({
        where : {id : tasks[0].projectId},
        include : {members : {include : {user : true}}}
    })

    if(!project){
        return res.status(404).json({message : "Project not found"})
    }else if(project.team_lead !== userId){
        return res.status(404).json({message : "You do not have Admin rights"})
    } 

    await prisma.task.deleteMany({
        where : {id : {in : taskIds}}
    })
    

    res.json({ message : "Task deleted Successfully"})

  } catch (error) {
    console.log(error)
    return res.status(500).json({message: error.code || error.message})
  }
};