import chatHandler from "./chat.js";
import statusHandler from "./status.js";
import callHandler from "./call.js";
import { redisClient } from "../config/redis.connection.js";
import {
  addSocketForUser,
  setSocketVisibility,
  removeSocket,
} from "../utils/redis-helpers.js";
import { getContactsForUser } from "../controllers/users.controller.js";

export default function (io) {
  /**
   * Socket connection handler
   * - Extracts `userId` from handshake (auth/query/headers).
   * - Registers socketId under `io.userSockets` for multi-device support.
   * - Cleans up registry on disconnect.
   */

  io.on("connection", async (socket) => {
    // Resolve identity from the handshake
    const rawUserId =
      socket.handshake.auth?.userId ||
      socket.handshake.query?.userId ||
      socket.handshake.headers?.userId;
    const userId = rawUserId ? String(rawUserId) : null;
    console.log("userid adding to room: ", userId);

    const socketId = socket?.id;

    // Track this socket under the userId
    if (!userId) return;

    socket.join(userId);

    console.log("Socket rooms:", Array.from(socket.rooms));

    await addSocketForUser(userId, socketId);

    // io.emit("presence:update", { userId, online: true });

    socket.on("client:visibility", async ({ visible }) => {
      try {
        if (!socketId) console.log("NO socket id found");
        const hasBecomeVisible = await setSocketVisibility(socketId, !!visible);

        if (hasBecomeVisible) {
          const contacts = await getContactsForUser(userId);
          if (!contacts) {
            console.log("no contacts found");
            return;
          }
          contacts.forEach((contact) => {
            console.log(contact._id.toString());
            io.to(contact._id.toString()).emit("presence:update", {
              userId,
              online: true,
            });
          });
          console.log(`User ${userId} is online`);
        } else {
          console.log(`User ${userId} went offline`);
          console.log(hasBecomeVisible);
        }
      } catch (err) {
        console.error("Visibility update failed", err);
      }
    });

    socket.on("ping-server", (payload, ack) => {
      if (ack)
        ack({
          ok: true,
          ts: Date.now(),
        });
    });

    chatHandler(io, socket);
    statusHandler(io, socket);
    callHandler(io, socket);

    socket.on("disconnect", async () => {
      try {
        await removeSocket(socket.id);

        const remaining = await redisClient.sCard(`user:${userId}:sockets`);
        if (remaining === 0) {
          await redisClient.set(`presence:${userId}`, "offline", { EX: 60 });

          const contacts = await getContactsForUser(userId);
          contacts.forEach((contact) => {
            io.to(contact._id.toString()).emit("presence:update", {
              userId,
              online: false,
              lastSeen: Date.now(),
            });
          });
        }
      } catch (err) {
        console.error("Disconnect cleanup failed", err);
      }
    });
  });
}
