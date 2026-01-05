import conversationModel from "../models/conversations.model.js";
import messageModel from "../models/messages.model.js";
import userModel from "../models/users.model.js";
import { v4 as uuidv4 } from "uuid";
import {
  anySocketVisibleForUser,
  getUserSocketIds,
} from "../utils/redis-helpers.js";
import subscriptionModel from "../models/subscriptions.model.js";
import { sendPushToTokens } from "../utils/notify.js";

export default function (io, socket) {
  /**
   * normalizeAttachmentItem
   * Converts a client-provided attachment payload to the Message.attachments schema shape.
   * Returns an object with url, format, size, duration, fileName, width, height.
   */
  function normalizeAttachmentItem(item) {
    if (!item) return null;
    const url = item.url || item.secure_url;
    if (!url) return null;

    // Prefer explicit format; otherwise derive from mimeType or URL extension
    let format = (item.format || "").toLowerCase();
    const mimeType = (item.mimeType || "").toLowerCase();
    if (!format && mimeType.includes("/")) {
      format = mimeType.split("/")[1];
    }
    if (!format) {
      const match = url.toLowerCase().match(/\.([a-z0-9]+)(?:\?|#|$)/);
      if (match) format = match[1];
    }

    const size = item.bytes ?? item.size;
    const duration = item.duration;
    const fileName =
      item.originalFilename ??
      item.fileName ??
      (item.publicId ? String(item.publicId).split("/").pop() : undefined);
    const width = item.width;
    const height = item.height;

    return { url, format, size, duration, fileName, width, height };
  }

  /**
   * join-room
   * Adds the current socket to a room and notifies others.
   */
  socket.on("join-room", ({ roomId, user }) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", { user, socketId: socket.id });
  });

  /**
   * leave-room
   * Removes the current socket from a room and notifies others.
   */
  socket.on("leave-room", ({ roomId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit("user-left", { socketId: socket.id });
  });

  /**
   * initiate-chat
   * - Validates contact by id, upserts/fetches the direct conversation.
   * - Joins BOTH participants’ sockets (initiator and contact) to the room.
   * - Notifies the initiator (and optionally the room) that chat is initialized.
   * - Marks pending messages from the other user as delivered.
   */
  socket.on("initiate-chat", async ({ userId, contactId, room }, ack) => {
    try {
      const contact = await userModel.findOne({ _id: contactId });
      if (!contact) {
        return socket.emit("error", {
          status: "error",
          error: "Contact not found",
        });
      }
      const conversation = await conversationModel.createDirectConversation(
        userId,
        contact._id
      );

      const roomId = conversation._id.toString();
      socket.join(roomId);

      const initiatorUserId = String(userId);
      const contactUserId = contact._id.toString();

      const joinAllSockets = (uid) => {
        const set = io.userSockets?.get(uid);
        if (!set) return;
        for (const sid of set) {
          const s = io.sockets.sockets.get(sid);
          s?.join(roomId);
        }
      };

      joinAllSockets(initiatorUserId);
      joinAllSockets(contactUserId);

      ack?.({ status: "success" });

      socket.emit("chat-initialized", { roomId });
      io.to(roomId).emit("user-joined", {
        userId: initiatorUserId,
        socketId: socket.id,
      });

      try {
        const connectedUserId = String(socket.userId?.toString());
        const pending = await messageModel
          .find({
            conversation: conversation._id,
            status: "sent",
            from: { $ne: connectedUserId },
          })
          .select("_id")
          .lean();

        if (pending.length > 0) {
          const updatedMessages = await messageModel.updateMany(
            {
              conversation: conversation._id,
              status: "sent",
              from: { $ne: connectedUserId },
            },
            { $set: { status: "delivered" } }
          );

          if (updatedMessages) {
            for (const m of pending) {
              io.to(roomId).emit("message:delivered", {
                messageId: String(m._id),
              });
            }
          }
        }
      } catch (err) {
        console.log("initiate-chat delivery catch-up error:", err);
      }
    } catch (err) {
      console.log("initiate-chat error:", err);
      ack?.({ status: "error", error: err.message });
    }
  });

  /**
   * join:conversation
   * Adds the current socket to an existing conversation room.
   */
  socket.on("join:conversation", ({ roomId }) => {
    socket.join(roomId);
  });

  /**
   * send-message
   * Persists the text message and any provided attachments on the Message document.
   * - Normalizes attachment payloads to {url, format, size, duration, fileName, width, height}.
   * - Pushes attachments to Message.attachments.
   * - Returns payload including normalized attachments for client consumption.
   */
  socket.on(
    "send-message",
    async (
      { roomId, message, from, tempId, taggedMessage, attachment },
      ack
    ) => {
      try {
        const conversation = await conversationModel.findById(roomId);
        if (!conversation) {
          return ack?.({ status: "error", error: "Conversation not found" });
        }

        const savedMessage = await messageModel.create({
          conversation: conversation._id,
          from,
          message,
          ts: new Date(),
          taggedMessage: taggedMessage ? taggedMessage : null,
        });

        if (!savedMessage) {
          return ack?.({ status: "failed" });
        }

        await conversation.updateLastMessage(savedMessage._id, savedMessage.ts);

        // Persist attachment(s) and collect normalized objects
        const attachmentsData = [];
        if (attachment) {
          const items = Array.isArray(attachment) ? attachment : [attachment];
          for (const item of items) {
            const normalized = normalizeAttachmentItem(item);
            if (normalized) attachmentsData.push(normalized);
          }

          if (attachmentsData.length) {
            await messageModel.updateOne(
              { _id: savedMessage._id },
              { $push: { attachments: { $each: attachmentsData } } }
            );
          }
        }

        const payload = {
          id: savedMessage._id.toString(),
          conversationId: conversation._id.toString(),
          from: savedMessage.from.toString(),
          message: savedMessage.message,
          ts: savedMessage.ts.toISOString(),
          tempId,
          attachments: attachmentsData,
        };

        console.log("send-message payload:", payload);

        socket.to(roomId).emit("chat-message", payload);
        ack?.({ status: "success", payload });

        // Push notification to offline recipients
        process.nextTick(async () => {
          try {
            const recipients = conversation.participants
              .map(String)
              .filter((id) => id !== String(from));
            const tokensToNotify = new Map();
            for (const rid of recipients) {
              const isAnyVisible = await anySocketVisibleForUser(rid);
              if (isAnyVisible) continue;

              const socketIds = await getUserSocketIds(rid);
              if (socketIds.length === 0) {
                const subs = await subscriptionModel.find({ user: rid });
                for (const s of subs) {
                  if (s.token) tokensToNotify.set(s.token, true);
                }
              }
            }

            const tokens = Array.from(tokensToNotify.keys());
            const BATCH = 500;
            for (let i = 0; i < tokens.length; i += BATCH) {
              const batch = tokens.slice(i, i + BATCH);
              if (batch.length === 0) break;

              await sendPushToTokens(batch, {
                notification: {
                  title: "New Message",
                  body: message?.length > 120 ? message.slice(0, 120) : message,
                },
                data: {
                  conversationId: conversation._id.toString(),
                  messageId: savedMessage._id.toString(),
                },
              });
            }
          } catch (error) {
            console.log(error);
          }
        });
      } catch (error) {
        console.log(error);
        ack?.({ status: "error", error: error.message });
      }
    }
  );

  /**
   * message:received
   * Marks a message as delivered and notifies the room.
   */
  socket.on("message:received", async ({ messageId, roomId }) => {
    try {
      const message = await messageModel.findById(messageId);
      if (!message) return;
      const conversation = await conversationModel.findById(roomId);
      if (!conversation) return;
      message.status = "delivered";
      const savedMessage = await message.save();
      if (!savedMessage) return;
      socket
        .to(roomId)
        .emit("message:delivered", { messageId: message._id.toString() });
    } catch (err) {
      console.log("message:received error:", err);
    }
  });

  /**
   * messages:readUpTo
   * Marks messages up to a given ID as read and notifies the room.
   */
  socket.on("messages:readUpTo", async ({ conversationId, upToId }, ack) => {
    try {
      const upToMsg = await messageModel.findById(upToId);
      if (!upToMsg) return ack?.({ status: "error", error: "not_found" });

      const updatedMessages = await messageModel.updateMany(
        {
          conversation: conversationId,
          ts: { $lte: upToMsg.ts },
          from: { $ne: socket.userId },
        },
        { $set: { status: "read" } }
      );

      if (!updatedMessages) {
        return ack?.({ status: "error", error: "update_failed" });
      }

      socket.to(conversationId).emit("messages:read", {
        conversationId,
        upToId,
        readerId: socket.userId,
      });

      return ack?.({ status: "ok" });
    } catch (err) {
      console.log("messages:readUpTo error:", err);
      return ack?.({ status: "error", error: err.message });
    }
  });

  /**
   * create:group
   * Creates a new group conversation with the given participants.
   */
  socket.on("create:group", async ({ participants, title, creator }, ack) => {
    try {
      const users = await userModel.find({ _id: { $in: participants } });
      const validCreator = await userModel.findById(creator);
      if (!validCreator) {
        return ack?.({
          status: "error",
          error: "Creator is not a registered user",
        });
      }
      if (users.length !== participants.length) {
        return ack?.({
          status: "error",
          error: "One or more participants are not registered users",
        });
      }

      const uniqueParticipants = [...new Set(users.map((user) => user._id))];

      const roomId = uuidv4();
      const conversation = await conversationModel.create({
        roomId,
        title,
        participants: uniqueParticipants,
        creator: validCreator._id,
      });

      await conversation.populate(
        "participants",
        "_id email displayName profilePic"
      );

      if (!conversation) {
        return ack?.({
          status: "error",
          message: "Failed to create conversation",
        });
      }

      return ack?.({ status: "ok", conversation });
    } catch (error) {
      ack?.({ status: "error", message: error.message });
      console.log(error);
    }
  });
}
