import contactModel from "../models/contacts.model.js";
import statusModel from "../models/statuses.model.js";
import { redisClient } from "../config/redis.connection.js";

export default function (io, socket) {
  socket.on("status:new", async (payload, ack) => {
    try {
      const rawUserId =
        socket.handshake.auth?.userId ||
        socket.handshake.query?.userId ||
        socket.handshake.headers?.userId;
      const userId = rawUserId ? String(rawUserId) : null;
      if (!userId) {
        if (ack) ack({ status: "error", error: "unauthenticated" });
        return;
      }
      const { media, caption } = payload;
      if (!media) {
        if (ack) ack({ status: "error", error: "media is required" });
        return;
      }
      const { resource_type, url, thumbUrl, publicId } = media;
      if (!resource_type || !url || !publicId) {
        if (ack) ack({ status: "error", error: "media is required" });
        return;
      }
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const allowedHost = `res.cloudinary.com`;
      try {
        const u = new URL(String(media.url));
        if (!u.hostname.endsWith(allowedHost)) {
          if (ack) ack({ status: "error", error: "invalid_media_url" });
          return;
        }
      } catch (e) {
        if (ack) ack({ status: "error", error: "invalid_media_url" });
        return;
      }

      const resourceType = media.resource_type || "image";
      const allowedTypes = ["image", "video"];
      if (!allowedTypes.includes(resourceType)) {
        if (ack) ack({ status: "error", error: "unsupported_media_type" });
        return;
      }

      const peopleWhoAddedSender = await contactModel.distinct("owner", {
        contactUser: userId,
        isBlocked: false,
      });

      if (!peopleWhoAddedSender.length) {
        // Persist story anyway (sender's story exists but nobody mutual)
        const story = await statusModel.create({
          userId,
          publicId,
          url,
          thumbUrl,
          resourceType,
          caption,
          expiresAt,
        });
        return ack?.({
          status: "ok",
          story,
          recipients: [],
        });
      }

      const mutualContacts = await contactModel.distinct("contactUser", {
        owner: userId,
        contactUser: { $in: peopleWhoAddedSender },
        isBlocked: false,
      });

      const story = await statusModel.create({
        userId,
        publicId,
        url,
        thumbUrl,
        resourceType,
        caption,
        expiresAt,
      });

      const notified = [];
      for (const uid of mutualContacts) {
        const socketIds = await redisClient.sMembers(`user:${uid}:sockets`);
        if (!socketIds || socketIds.length === 0) continue;
        for (const sid of socketIds) {
          if (!notified.includes(uid)) notified.push(uid);
          io.to(sid).emit("status:incoming", {
            story: {
              id: story._id.toString(),
              owner: userId,
              caption,
              media,
              createdAt: story.createdAt?.toISOString(),
              expiresAt: story.expiresAt?.toISOString(),
            },
          });
        }
      }
      if (ack) ack({ status: "success", story, recipients: notified });
    } catch (error) {
      console.log(error);
      if (ack) ack({ status: "error", error: error.message });
    }
  });
}
