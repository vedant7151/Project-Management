import { Inngest } from "inngest";
import prisma from "../config/prisma.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "project-management" });

// Helper to safely extract fields from Clerk payload
function extractUserFields(data) {
  // FIXED: Added check for data.data (Clerk's standard webhook structure)
  const user = data?.user ?? data?.data ?? data ?? {};

  const email = user?.email_addresses?.[0]?.email_address ?? null;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || null;
  const image = user?.image_url ?? user?.profile_image_url ?? null;

  return { id: user?.id ?? null, email, name, image };
}

// Inngest Function to save or update user data to a database (idempotent)
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event, step }) => {
    console.log("syncUserCreation event:", event);
    try {
      const { id, email, name, image } = extractUserFields(event.data);

      if (!id) {
        throw new Error("Missing user id in Clerk payload");
      }

      // Use upsert to avoid unique-constraint errors if user already exists
      await prisma.user.upsert({
        where: { id },
        update: { email, name, image },
        create: { id, email, name, image },
      });

      console.log(`User synced (upsert) id=${id}`);
    } catch (err) {
      console.error("Error in syncUserCreation:", err);
      throw err; // rethrow so Inngest marks failed run (or remove if you want to swallow)
    }
  }
);

// Inngest function to delete user from database (safe)
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-from-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event }) => {
    console.log("syncUserDeletion event:", event);
    try {
      const { id } = extractUserFields(event.data);
      if (!id) {
        throw new Error("Missing user id in Clerk payload");
      }

      // deleteMany is idempotent (won't throw if no rows matched)
      const result = await prisma.user.deleteMany({ where: { id } });
      console.log(`Deleted ${result.count} user(s) with id=${id}`);
    } catch (err) {
      console.error("Error in syncUserDeletion:", err);
      throw err;
    }
  }
);

// Inngest function to update user data in database
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event }) => {
    console.log("syncUserUpdation event:", event);
    try {
      const { id, email, name, image } = extractUserFields(event.data);

      if (!id) {
        throw new Error("Missing user id in Clerk payload");
      }

      // Use update if user exists; if not, you may want upsert too
      await prisma.user.upsert({
        where: { id },
        update: { email, name, image },
        create: { id, email, name, image },
      });

      console.log(`User updated/upserted id=${id}`);
    } catch (err) {
      console.error("Error in syncUserUpdation:", err);
      throw err;
    }
  }
);

// Helper to extract organization fields safely (adjust after inspecting real payload)
function extractOrgFields(payload) {
  // Clerk sometimes places the organization under payload.organization or directly in payload
  const org = payload?.organization ?? payload ?? {};
  return {
    id: org?.id ?? null,
    name: org?.name ?? null,
    slug: org?.slug ?? org?.domain ?? null,
    ownerId: org?.created_by ?? org?.creator ?? org?.owner_id ?? null,
    image: org?.image_url ?? org?.profile_image_url ?? null,
  };
}

// Create / upsert workspace and add creator as ADMIN (transactional & idempotent)
const syncWorkspaceCreation = inngest.createFunction(
  { id: "sync-workspace-from-clerk" },
  { event: "clerk/organization.created" },
  async ({ event }) => {
    console.log("syncWorkspaceCreation event:", event);
    try {
      const { id, name, slug, ownerId, image } = extractOrgFields(event.data);

      if (!id) throw new Error("Missing organization id in payload");
      if (!ownerId) console.warn("No ownerId found in org payload (ownerId null) — proceeding anyway");

      // Upsert workspace and ensure member exists. Use transaction so both succeed or fail.
      await prisma.$transaction([
        prisma.workspace.upsert({
          where: { id },
          update: { name, slug, image },
          create: { id, name, slug, ownerId, image },
        }),
        // Upsert workspace member — assumes workspaceMember model has a unique constraint on (userId, workspaceId)
        prisma.workspaceMember.upsert({
          where: {
            // Replace this with your workspaceMember unique field; adjust accordingly.
            // For example, if composite unique (userId_workspaceId) exists in Prisma, use that name.
            userId_workspaceId: { userId: ownerId, workspaceId: id }
          },
          update: { role: "ADMIN" },
          create: { userId: ownerId, workspaceId: id, role: "ADMIN" },
        })
      ]);

      console.log(`Workspace upserted and admin ensured for workspace id=${id}`);
    } catch (err) {
      console.error("Error in syncWorkspaceCreation:", err);
      throw err;
    }
  }
);

// Update workspace (idempotent using upsert)
const syncWorkspaceUpdation = inngest.createFunction(
  { id: "update-workspace-from-clerk" },
  { event: "clerk/organization.updated" },
  async ({ event }) => {
    console.log("syncWorkspaceUpdation event:", event);
    try {
      const { id, name, slug, image } = extractOrgFields(event.data);
      if (!id) throw new Error("Missing organization id in payload");

      // Use upsert to avoid "not found" errors if record missing
      await prisma.workspace.upsert({
        where: { id },
        update: { name, slug, image },
        create: { id, name, slug, image, ownerId: null },
      });

      console.log(`Workspace updated/upserted id=${id}`);
    } catch (err) {
      console.error("Error in syncWorkspaceUpdation:", err);
      throw err;
    }
  }
);

// Delete workspace safely (idempotent)
const syncWorkspaceDeletion = inngest.createFunction(
  { id: "delete-workspace-with-clerk" },
  { event: "clerk/organization.deleted" },
  async ({ event }) => {
    console.log("syncWorkspaceDeletion event:", event);
    try {
      const { id } = extractOrgFields(event.data);
      if (!id) throw new Error("Missing organization id in payload");

      const result = await prisma.workspace.deleteMany({ where: { id } });
      console.log(`Deleted ${result.count} workspace(s) with id=${id}`);
    } catch (err) {
      console.error("Error in syncWorkspaceDeletion:", err);
      throw err;
    }
  }
);

// Workspace member creation (invitation accepted)
const syncWorkspaceMemberCreation = inngest.createFunction(
  { id: "sync-workspace-member-from-clerk" },
  { event: "clerk/organizationInvitation.accepted" },
  async ({ event }) => {
    console.log("syncWorkspaceMemberCreation event:", event);
    try {
      const payload = event.data ?? {};
      // fields may be user_id, organization_id, role_name (adjust if payload differs)
      const userId = payload?.user_id ?? payload?.userId ?? null;
      const workspaceId = payload?.organization_id ?? payload?.organizationId ?? payload?.workspace_id ?? null;
      const roleRaw = payload?.role_name ?? payload?.roleName ?? "MEMBER";
      const role = String(roleRaw).toUpperCase();

      if (!userId || !workspaceId) {
        throw new Error(`Missing userId or workspaceId in payload: userId=${userId} workspaceId=${workspaceId}`);
      }

      // Ensure workspace exists (optional). If you prefer, upsert member directly.
      await prisma.workspaceMember.upsert({
        where: {
          // Use your actual unique constraint name here.
          userId_workspaceId: { userId, workspaceId }
        },
        update: { role },
        create: { userId, workspaceId, role },
      });

      console.log(`WorkspaceMember upserted: user=${userId} workspace=${workspaceId} role=${role}`);
    } catch (err) {
      console.error("Error in syncWorkspaceMemberCreation:", err);
      throw err;
    }
  }
);



// Export your functions so Inngest can find them
export const functions = [
    syncUserCreation, 
    syncUserDeletion, 
    syncUserUpdation , 
    syncWorkspaceCreation , 
    syncWorkspaceUpdation ,
    syncWorkspaceDeletion , 
    syncWorkspaceMemberCreation];
