import { Inngest } from "inngest";
import prisma from "../config/prisma.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "project-management" });

// Helper to safely extract fields from Clerk payload
function extractUserFields(data) {
  // The payload shape may vary; adjust if your event shows user under data.user
  const user = data?.user ?? data ?? {};
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

// Export your functions so Inngest can find them
export const functions = [syncUserCreation, syncUserDeletion, syncUserUpdation];
