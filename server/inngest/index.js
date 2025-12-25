import { Inngest } from "inngest";
import prisma from "../config/prisma.js";
import sendEmail from "../config/nodemailer.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "project-management" });

// Helper to safely extract fields from Clerk payload
function extractUserFields(data) {
  // FIXED: Added check for data.data (Clerk's standard webhook structure)
  const user = data?.user ?? data?.data ?? data ?? {};

  const email = user?.email_addresses?.[0]?.email_address ?? null;
  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || null;
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

function extractOrgFields(payload) {
  // FIXED: Check for payload.data
  const org = payload?.data ?? payload?.organization ?? payload ?? {};

  return {
    id: org?.id ?? null,
    name: org?.name ?? null,
    slug: org?.slug ?? org?.domain ?? null,
    // Clerk usually sends 'created_by' as the user ID string
    ownerId: org?.created_by ?? org?.creator ?? org?.owner_id ?? null,
    image: org?.image_url ?? org?.profile_image_url ?? null,
  };
}
// Create / upsert workspace and add creator as ADMIN
export const syncWorkspaceCreation = inngest.createFunction(
  { id: "sync-workspace-from-clerk" },
  { event: "clerk/organization.created" },
  async ({ event }) => {
    console.log("syncWorkspaceCreation event:", event);
    try {
      const { id, name, slug, ownerId, image } = extractOrgFields(event.data);

      if (!id) throw new Error("Missing organization id in payload");

      const operations = [];

      // 1. Always upsert the Workspace
      // FIXED: Mapped 'image' -> 'image_url' to match schema
      operations.push(
        prisma.workspace.upsert({
          where: { id },
          update: { name, slug, image_url: image },
          create: { id, name, slug, ownerId, image_url: image },
        })
      );

      // 2. Add the Member if we have an ownerId
      if (ownerId) {
        operations.push(
          prisma.workspaceMember.upsert({
            where: {
              userId_workspaceId: { userId: ownerId, workspaceId: id },
            },
            update: { role: "ADMIN" },
            create: { userId: ownerId, workspaceId: id, role: "ADMIN" },
          })
        );
      } else {
        console.warn(
          `Skipping Member creation for workspace ${id}: No ownerId found.`
        );
      }

      await prisma.$transaction(operations);
      console.log(`Workspace upserted (id=${id}). Member added? ${!!ownerId}`);
    } catch (err) {
      console.error("Error in syncWorkspaceCreation:", err);
      throw err;
    }
  }
);

// Update workspace (idempotent using upsert)
export const syncWorkspaceUpdation = inngest.createFunction(
  { id: "update-workspace-from-clerk" },
  { event: "clerk/organization.updated" },
  async ({ event }) => {
    console.log("syncWorkspaceUpdation event:", event);
    try {
      const { id, name, slug, image } = extractOrgFields(event.data);
      if (!id) throw new Error("Missing organization id in payload");

      // FIXED: Using .update() instead of .upsert()
      // This prevents crashing on 'ownerId' requirements if the create event hasn't arrived yet.
      // Inngest will retry this function automatically until the workspace exists.
      await prisma.workspace.update({
        where: { id },
        data: {
          name,
          slug,
          image_url: image, // FIXED: Mapped to schema field
        },
      });

      console.log(`Workspace updated id=${id}`);
    } catch (err) {
      // "Record to update not found" errors are expected if events are out of order.
      // Throwing ensures Inngest retries later.
      console.error("Error in syncWorkspaceUpdation:", err);
      throw err;
    }
  }
);

// Delete workspace safely (idempotent)
export const syncWorkspaceDeletion = inngest.createFunction(
  { id: "delete-workspace-with-clerk" },
  { event: "clerk/organization.deleted" },
  async ({ event }) => {
    console.log("syncWorkspaceDeletion event:", event);
    try {
      const { id } = extractOrgFields(event.data);
      if (!id) throw new Error("Missing organization id in payload");

      // deleteMany triggers DB-level cascades (projects, members) automatically
      // because of 'onDelete: Cascade' in your schema.
      const result = await prisma.workspace.deleteMany({ where: { id } });

      console.log(`Deleted ${result.count} workspace(s) with id=${id}`);
    } catch (err) {
      console.error("Error in syncWorkspaceDeletion:", err);
      throw err;
    }
  }
);

// Inngest function to sync workspace members
const syncWorkspaceMemberCreation = inngest.createFunction(
  { id: "sync-workspace-member-from-clerk" },
  { event: "clerk/organizationMembership.created" }, // FIXED: Use Membership event
  async ({ event }) => {
    console.log("syncWorkspaceMemberCreation event:", event);
    try {
      const membership = event.data ?? {};

      // 1. Extract IDs from the Membership object structure
      // User ID is often in public_user_data
      const userId =
        membership.public_user_data?.user_id ??
        membership.public_user_data?.userId ??
        membership.user_id ?? // fallback
        null;

      // Organization ID is often in the 'organization' object
      const workspaceId =
        membership.organization?.id ??
        membership.organization_id ?? // fallback
        null;

      if (!userId || !workspaceId) {
        throw new Error(
          `Missing userId or workspaceId in payload: userId=${userId} workspaceId=${workspaceId}`
        );
      }

      // 2. Map Clerk Roles (org:admin) to Prisma Enum (ADMIN)
      const roleRaw = membership.role ?? "org:member";
      // Converts "org:admin" -> "ADMIN", "org:member" -> "MEMBER"
      const role = roleRaw.includes("admin") ? "ADMIN" : "MEMBER";

      // 3. Upsert the Member
      await prisma.workspaceMember.upsert({
        where: {
          // Matches the @@unique constraint in your schema
          userId_workspaceId: { userId, workspaceId },
        },
        update: { role },
        create: { userId, workspaceId, role },
      });

      console.log(
        `WorkspaceMember upserted: user=${userId} workspace=${workspaceId} role=${role}`
      );
    } catch (err) {
      console.error("Error in syncWorkspaceMemberCreation:", err);
      throw err;
    }
  }
);

// Inngest Function to send Email on task Creation
const sendTaskAssignmentEmail = inngest.createFunction(
  { id: "send-task-assignment-mail" },
  { event: "app/task.assigned" },
  async ({ event, step }) => {
    const { taskId, origin } = event.data;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignee: true, project: true },
    });

    await sendEmail({
      to: task.assignee.email,
      subject: `New Task Assignment in ${task.project.name} `,
      body: `
         <div style="max-width: 600px;">
    <h2>Hi ${task.assignee.name} 👋</h2>

    <p style="font-size: 16px;">
      You've been assigned a new task:
    </p>

    <p style="
      font-size: 18px;
      font-weight: bold;
      color: #007bff;
      margin: 8px 0;
    ">
      ${task.title}
    </p>

    <div style="
      border: 1px solid #ddd;
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 30px;
    ">
      <p style="margin: 6px 0;">
        <strong>Description:</strong> ${task.description}
      </p>

      <p style="margin: 6px 0;">
        <strong>Due Date:</strong>
        ${new Date(task.due_date).toLocaleDateString()}
      </p>
    </div>

    <a href="${origin}" style="
      background-color: #007bff;
      padding: 12px 24px;
      border-radius: 5px;
      color: #fff;
      font-weight: 600;
      font-size: 16px;
      text-decoration: none;
      display: inline-block;
    ">
      View Task
    </a>
    <p style="margin-top: 20px; font-size: 14px; color: #6c757d;">
  Please make sure to review and complete it before the due date.
</p>

  </div>

      `,
    });

    if (
      new Date(task.due_date).toLocaleDateString() !== new Date().toDateString()
    ) {
      await step.sleepUntil("wait-for-due-date", new Date(task.due_date));

      await step.run("check-if-task-is-completed", async () => {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { assignee: true, project: true },
        });

        if (!task) return;

        if (task.status !== "DONE") {
          await step.run("send-task-reminder-email", async () => {
            await sendEmail({
              to: task.assignee.email,
              subject: `Reminder for ${task.project.name}`,
              body: `
               <div style="max-width: 600px;">
    <h2>Hi ${task.assignee.name} 👋</h2>

    <p style="font-size: 16px;">
      You've been assigned a new task:
    </p>

    <p style="
      font-size: 18px;
      font-weight: bold;
      color: #007bff;
      margin: 8px 0;
    ">
      ${task.title}
    </p>

    <div style="
      border: 1px solid #ddd;
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 30px;
    ">
      <p style="margin: 6px 0;">
        <strong>Description:</strong> ${task.description}
      </p>

      <p style="margin: 6px 0;">
        <strong>Due Date:</strong>
        ${new Date(task.due_date).toLocaleDateString()}
      </p>
    </div>

    <a href="${origin}" style="
      background-color: #007bff;
      padding: 12px 24px;
      border-radius: 5px;
      color: #fff;
      font-weight: 600;
      font-size: 16px;
      text-decoration: none;
      display: inline-block;
    ">
      View Task
    </a>
    <p style="margin-top: 20px; font-size: 14px; color: #6c757d;">
  Please make sure to review and complete it before the due date.
</p>

  </div>
              `,
            });
          });
        }
      });
    }
  }
);

// Export your functions so Inngest can find them
export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
  syncWorkspaceCreation,
  syncWorkspaceUpdation,
  syncWorkspaceDeletion,
  syncWorkspaceMemberCreation,
  sendTaskAssignmentEmail
];
