import { Inngest } from "inngest";
import prisma from "../config/prisma.js";

export const inngest = new Inngest({ id: "project-management" });

// --- HELPERS ---

function extractUserFields(data) {
  const user = data?.user ?? data ?? {};
  const email = user?.email_addresses?.[0]?.email_address ?? null;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || null;
  const image = user?.image_url ?? user?.profile_image_url ?? null;
  return { id: user?.id ?? null, email, name, image };
}

function extractOrgFields(payload) {
  const org = payload?.organization ?? payload ?? {};
  return {
    id: org?.id ?? null,
    name: org?.name ?? null,
    slug: org?.slug ?? org?.domain ?? null,
    ownerId: org?.created_by ?? org?.creator ?? org?.owner_id ?? null,
    // We extract it as 'image', but we must save it as 'image_url' later
    image: org?.image_url ?? org?.profile_image_url ?? null, 
  };
}

// --- FUNCTIONS ---

// 1. Sync User Creation
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event }) => {
    const { id, email, name, image } = extractUserFields(event.data);
    if (!id) return;

    await prisma.user.upsert({
      where: { id },
      update: { email, name, image },
      create: { id, email, name, image },
    });
  }
);

// 2. Sync User Update
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event }) => {
    const { id, email, name, image } = extractUserFields(event.data);
    if (!id) return;

    await prisma.user.upsert({
      where: { id },
      update: { email, name, image },
      create: { id, email, name, image },
    });
  }
);

// 3. Sync User Deletion
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-from-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event }) => {
    const { id } = extractUserFields(event.data);
    if (!id) return;
    await prisma.user.deleteMany({ where: { id } });
  }
);

// 4. Sync Workspace Creation (The one causing your error)
const syncWorkspaceCreation = inngest.createFunction(
  { id: "sync-workspace-from-clerk" },
  { event: "clerk/organization.created" },
  async ({ event }) => {
    const { id, name, slug, ownerId, image } = extractOrgFields(event.data);

    if (!id) throw new Error("Missing organization id");
    
    // FIX 1: Map 'image' to 'image_url'
    // FIX 2: Check ownerId before creating
    if (!ownerId) {
        console.warn("Cannot create workspace without ownerId");
        // We can't proceed with creation if we don't know the owner
        return; 
    }

    await prisma.$transaction([
      prisma.workspace.upsert({
        where: { id },
        update: { name, slug, image_url: image }, // Fixed field name
        create: { 
            id, 
            name, 
            slug, 
            ownerId, 
            image_url: image // Fixed field name
        },
      }),
      // Create the Admin Member
      prisma.workspaceMember.upsert({
        where: {
          userId_workspaceId: { userId: ownerId, workspaceId: id }
        },
        update: { role: "ADMIN" },
        create: { userId: ownerId, workspaceId: id, role: "ADMIN" },
      })
    ]);
  }
);

// 5. Sync Workspace Update
const syncWorkspaceUpdation = inngest.createFunction(
  { id: "update-workspace-from-clerk" },
  { event: "clerk/organization.updated" },
  async ({ event }) => {
    const { id, name, slug, image } = extractOrgFields(event.data);
    if (!id) return;

    
    // Note: We cannot "Create" here if ownerId is missing, so we only update.
    // If the workspace is missing entirely, this might fail, which is expected behavior 
    // because we shouldn't create a workspace without an owner.
    await prisma.workspace.update({
        where: { id },
        data: { 
            name, 
            slug, 
            image_url: image // Fixed field name
        }
    }).catch(err => {
        // Ignore "Record to update not found" errors to prevent noise
        if (err.code === 'P2025') return null;
        throw err;
    });
  }
);

// 6. Sync Workspace Deletion
const syncWorkspaceDeletion = inngest.createFunction(
  { id: "delete-workspace-with-clerk" },
  { event: "clerk/organization.deleted" },
  async ({ event }) => {
    const { id } = extractOrgFields(event.data);
    if (!id) return;
    await prisma.workspace.deleteMany({ where: { id } });
  }
);

// 7. Sync Member Addition (Invitation Accepted)
const syncWorkspaceMemberCreation = inngest.createFunction(
  { id: "sync-workspace-member-from-clerk" },
  { event: "clerk/organizationInvitation.accepted" },
  async ({ event }) => {
    const payload = event.data ?? {};
    const userId = payload?.user_id ?? payload?.userId ?? payload?.public_user_data?.user_id;
    const workspaceId = payload?.organization_id ?? payload?.organizationId;
    const roleRaw = payload?.role ?? "org:member";
    
    // Map Clerk roles to your Enum
    const role = roleRaw.includes("admin") ? "ADMIN" : "MEMBER";

    if (!userId || !workspaceId) return;

    await prisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: { userId, workspaceId }
      },
      update: { role },
      create: { userId, workspaceId, role },
    });
  }
);

export const functions = [
    syncUserCreation, 
    syncUserDeletion, 
    syncUserUpdation, 
    syncWorkspaceCreation, 
    syncWorkspaceUpdation,
    syncWorkspaceDeletion, 
    syncWorkspaceMemberCreation
];