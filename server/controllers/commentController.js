import prisma from "../config/prisma.js";

//Add comment
export const addComment = async (req, res) => {
  try {
    const {userId} = await req.auth()
    const {content , taskId} = req.body
    
    //Check if user is project member
    const task = await prisma.task.findUnique({
        where : {id : taskId}
    })

    const project = await prisma.project.findUnique({
        where : {id : task.projectId},
        include : {members : {include : {user : true}}}
    })

    if(!project){
        return res.status(404).json({ message: "Projecct not found" });
    }

    const member = project.members.find((member) => member.userId === userId)
    if (!member) {
         return res.status(403).json({ message: "You are not the member of project " });
    }

    const comment = await prisma.comment.create({
        data : {taskId , content ,userId },
        include : {user : true}
    })

    res.json({comment , message : "Comment created"})

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.code || error.message });
  }
};



//Get comments for tasks

export const getTaskComments = async(req , res) =>{
    try {
        const {taskId} = req.params
        const comments = await prisma.comment.findMany({
            where : {taskId} ,
            include : {user : true}
        })

        res.json({comments})

    } catch (error) {
        console.log(error);
    res.status(500).json({ message: error.code || error.message });
  
    }
}