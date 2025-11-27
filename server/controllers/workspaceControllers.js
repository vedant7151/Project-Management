import prisma from "../config/prisma.js"
import {inngest} from "../inngest/index.js"
// get All workspaces for user
export const getUserWorkspaces = async (req, res)=>{
    try {
        const {userId} = await req.auth()
        const workspaces = await prisma.workspace.findMany({
            where : {
                members : {some : {userId : userId}}
            },
            include : {
                members : {include : {user : true}},
                projects : {
                    include : {
                        tasks : {include : {assignee : true , comments : {include : {user : true}}}},
                        members : {include : {user : true}}
                    }
                },
                owner : true
            }
        })

        res.json({workspaces})

    } catch (error) {
        console.log(error)
        res.status(400).json({message : error.message})
    }
}






//Add member to workspace

export const addMember = async(req , res) =>{
    try {
        const {userId} = await req.auth()
        const {email , role , workspaceId , message} = req.body

        //Check if user exists
        const user = await prisma.user.findUnique({
            where : {email}
        })

        if(!user){
            return res.status(404).json({message : "User not found"})
        }

        if(!workspaceId || !role){
            return res.status(404).json({message : "Missing required parameters"})
        }

        if(!["ADMIN" , "ROLE"].includes(role)){
            return res.status(404).json({message : "Invalid Role"})
        }

        //fetch workspace
        const workspace = await prisma.workspace.findUnique(
            {
                where : {
                    id : workspaceId
                },
                include : {members : true}
            }
        )

        if(!workspace){
            return res.status(404).json({message : "Workspace not found"})
        }

        //Check Creator has admin role
        if(!workspace.members.find((member)=> member.userId === userId && member.role === "ADMIN")){
            return res.status(401).json({message : "You do not have admin rights"})
        }

        //Check if useer is already a member
        const existingMember = workspace.members.find((member) =>member.userId === userId)

        if(existingMember){
            return res.status(400).json({message : "User is already a member"})
        }

        const member = await prisma.workspaceMember.create({
            data : {
                userId : user.id,
                workspaceId,
                role,message
            }
        })
        res.json({ member, message : "Member added successfully "})
    } catch (error) {
        console.log(error)
        res.status(400).json({message : error.message})
    }
}

export const syncWorkspace = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { id, name, slug, imageUrl } = req.body;

        if (!id || !name) {
            return res.status(400).json({ message: "Missing workspace details" });
        }

        console.log(`Manually triggering sync for workspace: ${name}`);

        // Manually send the event to Inngest
        // We structure 'data' to match what Clerk would have sent
        await inngest.send({
            name: "clerk/organization.created", // Must match the event in your index.js
            data: {
                id: id,
                name: name,
                slug: slug,
                image_url: imageUrl,
                created_by: userId, // Important: maps to ownerId in your Inngest function
            },
            user: { id: userId }
        });

        res.status(200).json({ message: "Sync event triggered successfully" });
    } catch (error) {
        console.error("Sync Error:", error);
        res.status(500).json({ message: error.message });
    }
};