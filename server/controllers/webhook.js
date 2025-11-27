// controllers/webhook.js
import { Webhook } from "svix";
import prisma from "../config/prisma.js";

export const clerkWebhook = async (req, res) => {
  // 1. Get the secret from environment variables
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local");
  }

  // 2. Get the headers
  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).send("Error occured -- no svix headers");
  }

  // 3. Get the body
  // user-defined: ensure your body parser in server.js produces a Buffer or string for verification
  const payload = req.body;
  const body = JSON.stringify(payload);

  // 4. Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt;

  // 5. Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return res.status(400).send("Error occured");
  }

  // 6. Handle the Event
  const eventType = evt.type;

  if (eventType === "organization.created") {
    const { id, name, slug, created_by, image_url } = evt.data;

    try {
      // Transaction to create workspace AND add the creator as a member
      await prisma.$transaction(async (tx) => {
        // 1. Create the Workspace
        const workspace = await tx.workspace.create({
          data: {
            id: id, // Use Clerk's Org ID as your DB ID if possible
            name: name,
            imageUrl: image_url,
            // Add other fields from your schema if needed
            ownerId: created_by, 
          },
        });

        // 2. Create the Member (The User who created it)
        // We need to find the internal user ID based on the Clerk ID (created_by)
        const user = await tx.user.findUnique({
          where: { clerkId: created_by }, // Assuming you have a clerkId field or similar
        });

        if (user) {
          await tx.workspaceMember.create({
            data: {
              workspaceId: workspace.id,
              userId: user.id,
              role: "ADMIN",
            },
          });
        }
      });

      console.log(`Workspace ${name} created and synced`);
      return res.status(200).json({ message: "Workspace created" });
    } catch (error) {
      console.log("Error saving workspace:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }

  return res.status(200).send("Webhook received");
};