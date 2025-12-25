import prisma from "../config/prisma.js";

// Get all workspaces
export const getUserWorkspaces = async (req, res) => {
    try {
        // Use the userId attached by the protect middleware
        const userId = req.userId;

        const workspaces = await prisma.workspace.findMany({
            where: {
                members: { some: { userId: userId } }
            },
            include: {
                members: { include: { user: true } },
                projects: {
                    include: {
                        tasks: {
                            include: {
                                assignee: true,
                                comments: { include: { user: true } }
                            }
                        },
                        members: {}
                    }
                },
                owner: true
            }
        });

        res.json({ workspaces });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message });
    }
};

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

        // 3. Check if requester (You) has Admin rights
        const isAdmin = workspace.members.find(
            (member) => member.userId === userId && member.role === "ADMIN"
        );

        if (!isAdmin) {
            return res.status(401).json({ message: "You do not have admin rights" });
        }

        // 4. Check if the TARGET USER is already a member
        // (Fixed: Comparing user.id, not userId)
        const existingMember = workspace.members.find(
            (member) => member.userId === user.id
        );

        if (existingMember) {
            return res.status(400).json({ message: "User is already a member" });
        }

        // 5. Create the member
        const member = await prisma.workspaceMember.create({
            data: {
                userId: user.id,
                workspaceId, // Matches variable name
                role,
                // Note: Ensure your Prisma Schema has a 'message' field for workspaceMember
                // If not, remove the line below:
                message 
            }
        });

        res.json({ member, message: "Member added successfully" });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message });
    }
};