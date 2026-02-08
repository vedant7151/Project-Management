
import prisma from "../config/prisma.js";



//Create project
export const createProject = async (req, res) => {
    try {
        // 1. OPTIMIZATION: Use the userId attached by your 'protect' middleware
        const userId = req.userId; 

        const { workspaceId, description, name, status, start_date, end_date,
            team_members, team_lead, progress, priority } = req.body;

        // Check if user has admin role for workspace
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { members: { include: { user: true } } }
        })

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" })
        }

        // 2. BUG FIX: Fixed arrow function syntax (removed curly braces)
        const isAdmin = workspace.members.some(
            (member) => member.userId === userId && member.role === "ADMIN"
        );

        if (!isAdmin) {
            return res.status(403).json({ message: "You don't have permission to create projects in this workspace" })
        }

        // 3. SAFETY CHECK: Ensure team lead exists before accessing .id
        let teamLeadId = userId; // Default to creator if no lead specified
        
        if (team_lead) {
            const teamLeadUser = await prisma.user.findUnique({
                where: { email: team_lead },
                select: { id: true }
            })
            
            if (!teamLeadUser) {
                return res.status(400).json({ message: `Team lead with email ${team_lead} not found` });
            }
            teamLeadId = teamLeadUser.id;
        }

        const project = await prisma.project.create({
            data: {
                workspaceId,
                name,
                description,
                status,
                priority,
                progress,
                team_lead: teamLeadId, // Use the resolved ID
                start_date: start_date ? new Date(start_date) : null,
                end_date: end_date ? new Date(end_date) : null,
            }
        })

        // Add members to project if they are in the workspace
        if (team_members?.length > 0) {
            const membersToAdd = []
            workspace.members.forEach((member) => {
                if (team_members.includes(member.user.email)) {
                    membersToAdd.push(member.user.id)
                }
            })
            
            // Only run query if we actually found members
            if (membersToAdd.length > 0) {
                await prisma.projectMember.createMany({
                    data: membersToAdd.map(memberId => ({
                        projectId: project.id,
                        userId: memberId
                    }))
                })
            }
        }

        const projectWithMembers = await prisma.project.findUnique({
            where: { id: project.id },
            include: {
                members: { include: { user: true } },
                tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                owner: true // Ensure your schema has 'owner' on Project, otherwise remove this or change to 'workspace'
            }
        })

        res.json({ project: projectWithMembers, message: "Project created Successfully" })

    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message || error.code })
    }
}


// update Project
export const updateProject = async (req, res) => {
    try {
        // Optimization: Use req.userId from your middleware if available, 
        // otherwise await req.auth() is fine but ensure consistency.
        const { userId } = await req.auth();

        // 1. Destructure the inputs
        const { id, workspaceId, description, name, status, start_date, end_date, progress, priority } = req.body;

        // 2. Validate Project ID exists
        if (!id) {
            return res.status(400).json({ message: "Project ID is required" });
        }

        // 3. Permission Check: Verify Admin or Team Lead
        // First, fetch the workspace to check for ADMIN rights
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { members: true }
        });

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        // Check if user is an ADMIN in the workspace
        const isWorkspaceAdmin = workspace.members.some(
            (member) => member.userId === userId && member.role === "ADMIN"
        );

        if (!isWorkspaceAdmin) {
            // If not admin, check if they are the TEAM LEAD for this specific project
            const existingProject = await prisma.project.findUnique({
                where: { id }
            });

            if (!existingProject) {
                return res.status(404).json({ message: "Project not found" });
            }

            if (existingProject.team_lead !== userId) {
                return res.status(403).json({ message: "You don't have permission to update projects in this workspace" });
            }
        }

        // 4. Perform the Update
        const project = await prisma.project.update({
            where: { id },
            data: {
                // REMOVED: workspaceId (Cannot update this directly usually, and likely unchanged)
                name,
                description,
                status,
                priority,
                progress: parseInt(progress), // Ensure this is a number
                
                // FIXED TYPO: Was 'start_datestart_date'
                start_date: start_date ? new Date(start_date) : null,
                end_date: end_date ? new Date(end_date) : null,
            },
            // Optional: Include relations if you need to return them to the frontend
            include: {
                members: { include: { user: true } },
                // tasks: true, // Uncomment if you need tasks returned immediately
            }
        });

        res.json({ project, message: "Project updated Successfully" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message || error.code });
    }
}
//Add member to project
export const addMember = async(req,res)=>{
    try {
        const userId = req.userId; // Use attached userId from middleware
        const {projectId} = req.params;
        const {email} = req.body;

        // Fetch project with members
        const project = await prisma.project.findUnique({
            where : {id : projectId},
            include : {
                // crucial: include user to check email
                members : {include : {user : true}}, 
                workspace: {include: {members: true}} // include workspace to check if target user is in workspace
            }
        })

        if(!project){
            return res.status(404).json({message : "Project not found"})
        }

        // PERMISSION CHECK: Relaxed as per user request (Anyone can add)
        // const isTeamLead = project.team_lead === userId;
        // const isWorkspaceAdmin = project.workspace.members.some(m => m.userId === userId && m.role === 'ADMIN');
        
        // if(!isTeamLead && !isWorkspaceAdmin){
        //     return res.status(403).json({message : "Only project lead or workspace admin can add members"})
        // }

        // Check if user is already a member of the PROJECT
        // BUG FIX: member.user.email, not member.email
        const existingProjectMember = project.members.find((member)=> member.user?.email === email)

        if(existingProjectMember){
            return res.status(400).json({message : "User is already a member of this project"})
        }

        // Find the user to add
        const userToAdd = await prisma.user.findUnique({where : {email}})
        if(!userToAdd){
            return res.status(404).json({message : "User not found"})
        }

        // Check if user is in the WORKSPACE (Prerequisite)
        const isWorkspaceMember = project.workspace.members.some(m => m.userId === userToAdd.id);
        if(!isWorkspaceMember){
             return res.status(400).json({message : "User must be a member of the workspace first"});
        }

        // Add to project
        const member = await prisma.projectMember.create({
            data : {
                userId : userToAdd.id,
                projectId
            }
        })

        res.json({member , message : "Member added Successfully"})


    } catch (error) {
        console.log(error)
        res.status(500).json({message : error.message || error.code})
    }
}