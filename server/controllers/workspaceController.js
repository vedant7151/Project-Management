import prisma from "../config/prisma.js";
import { clerkClient } from "@clerk/express";

// Get all workspaces
// controllers/workspaceController.js

export const getUserWorkspaces = async (req , res) =>{
    try {
        const userId = req.userId; // Optimized from previous steps
        const workspaces = await prisma.workspace.findMany({
            where : {
                members : {some : {userId : userId}}
            },
            include : {
                members : {include : {user : true}},
                projects : {
                    include : {
                        tasks : {
                            include : {
                                assignee : true , 
                                comments : {include : { user : true}}
                            }
                        },
                        // ❌ OLD: members : {} 
                        // ✅ NEW: Fetch the User details inside the member!
                        members : {
                            include: { user: true } 
                        }
                    }
                },
                owner : true
            }
        })

        res.json({workspaces})
    } catch (error) {
        console.log(error)
        res.status(500).json({message : error.code || error.message})
    }
}

// Add member to workspace
export const addMember = async (req, res) => {
    try {
        // The Admin's ID (Current User)
        const userId = req.userId;
        
        // Corrected spelling of workspaceId
        const { email, role, workspaceId, message } = req.body; 

        // 1. Check if user exists (ADDED AWAIT)
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        if (!workspaceId || !role) {
            return res.status(400).json({ message: "Missing required parameter" });
        }

        if (!["ADMIN", "MEMBER"].includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        // 2. Fetch workspace to check permissions
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { members: true }
        });

        if (!workspace) {
            return res.status(400).json({ message: "Workspace not found" });
        }

        // 3. Check if requester (You) has Admin rights - DISABLED per user request
        // const isAdmin = workspace.members.find(
        //     (member) => member.userId === userId && member.role === "ADMIN"
        // );
        // if (!isAdmin) {
        //     return res.status(401).json({ message: "You do not have admin rights" });
        // }

        // 0. Ensure user is added to Clerk Organization (Sync Fix)
        try {
            const clerkRole = role === "ADMIN" ? "org:admin" : "org:member";
            await clerkClient.organizations.createOrganizationMembership({
                organizationId: workspaceId,
                userId: user.id,
                role: clerkRole,
            });
        } catch (clerkError) {
            // Check if error is "already a member" or similar - log and continue to ensure DB is synced
            console.log("Clerk sync warning (user might already be in org):", clerkError.message || clerkError);
        }

        // 4. Check if the TARGET USER is already a member (DB Check)
        const existingMember = workspace.members.find(
            (member) => member.userId === user.id
        );

        // If in DB, just return success (idempotent for "Repair")
        if (existingMember) {
            return res.json({ member: existingMember, message: "User is already a member (Sync updated)" });
        }

        // 5. Create the member in DB
        const member = await prisma.workspaceMember.create({
            data: {
                userId: user.id,
                workspaceId, // Matches variable name
                role,
                message 
            }
        });

        res.json({ member, message: "Member added successfully" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message });
    }
};