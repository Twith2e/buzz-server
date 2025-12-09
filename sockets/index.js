import chatHandler from "./chat.js";
import statusHandler from "./status.js";
import { redisClient, pubClient } from "../config/redis.connection.js";
import {
  addSocketForUser,
  getUserSocketIds,
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
    // Initialize the registry if missing
    io.userSockets = io.userSockets || new Map();

    // Resolve identity from the handshake
    const rawUserId =
      socket.handshake.auth?.userId ||
      socket.handshake.query?.userId ||
      socket.handshake.headers?.userId;
    const userId = rawUserId ? String(rawUserId) : null;
    const socketId = socket?.id;

    // Track this socket under the userId
    if (!userId) return;

    await addSocketForUser(userId, socketId);

    io.emit("presence:update", { userId, online: true });

    socket.on("client:visibility", async ({ visible }) => {
      // Only accept booleans and for authenticated sockets
      await setSocketVisibility(socketId, !!visible);
    });

    const userSocketCount = await pubClient.sCard(`user:${userId}:sockets`);
    if (userSocketCount === 1) {
      // notify contacts (implement getContactsForUser)
      const contacts = await getContactsForUser(userId); // your function to return array of userIds
      for (const contactId of contacts) {
        const cSockets = await getUserSocketIds(contactId);
        for (const sid of cSockets) {
          io.to(sid).emit("presence:update", { userId, online: true });
        }
      }
    }

    socket.on("ping-server", (payload, ack) => {
      if (ack)
        ack({
          ok: true,
          ts: Date.now(),
        });
    });

    chatHandler(io, socket);
    statusHandler(io, socket);

    socket.on("disconnect", async () => {
      await removeSocket(socket.id);
      const remaining = await redisClient.sCard(`user:${userId}:sockets`);
      if (remaining === 0) {
        await redisClient.set(`presence:${userId}`, "offline", {
          EX: 60,
        });
        io.emit("presence:update", { userId, online: false });
      }
    });
  });
}
