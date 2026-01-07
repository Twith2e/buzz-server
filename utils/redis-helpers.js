import { pubClient } from "../config/redis.connection.js";

async function addSocketForUser(userId, socketId) {
  await pubClient.sAdd(`user:${userId}:sockets`, socketId);
  // await pubClient.hSet(`socket:${socketId}`, {
  //   userId,
  //   visible: "1",
  //   lastSeen: new Date().toISOString(),
  // });
}

async function removeSocket(socketId) {
  const meta = await pubClient.hGetAll(`socket:${socketId}`);

  if (!meta || !meta.userId) {
    await pubClient.del(`socket:${socketId}`);
    return;
  }
  const userId = meta.userId;
  await pubClient.sRem(`user:${userId}:sockets`, socketId);
  await pubClient.del(`socket:${socketId}`);
}

// Function: setSocketVisibility
// Purpose: Update visibility and report whether it changed to true.
// Behavior: Returns true only when the previous state was not visible and now is visible.
async function setSocketVisibility(socketId, visible) {
  const key = `socket:${socketId}`;
  const prev = await pubClient.hGet(key, "visible"); // "1" | "0" | null
  const next = visible ? "1" : "0";

  await pubClient.hSet(key, {
    visible: next,
    lastSeen: new Date().toISOString(),
  });

  // Became visible if previous wasn't "1" and now is "1"
  return prev !== "1" && next === "1";
}

async function getUserSocketIds(userId) {
  const s = await pubClient.sMembers(`user:${userId}:sockets`);
  return s || [];
}

async function anySocketVisibleForUser(userId) {
  const ids = await getUserSocketIds(userId);
  if (!ids || ids.length === 0) return false;
  // pipeline for efficiency
  const pipeline = pubClient.multi();
  ids.forEach((sid) => pipeline.hGet(`socket:${sid}`, "visible"));
  const results = await pipeline.exec();
  // results: [[null, "1"], [null,"0"], ...] or similar
  for (const r of results) {
    const val = Array.isArray(r) ? r[1] : r; // adapt depending on redis client return
    if (val === "1") return true;
  }
  return false;
}

async function getUserSocketMeta(userId) {
  const ids = await getUserSocketIds(userId);
  const pipeline = pubClient.multi();
  ids.forEach((sid) => pipeline.hGetAll(`socket:${sid}`));
  const results = await pipeline.exec();
  return results.map((r) => (Array.isArray(r) ? r[1] : r)); // normalize
}

export {
  addSocketForUser,
  removeSocket,
  setSocketVisibility,
  getUserSocketIds,
  anySocketVisibleForUser,
  getUserSocketMeta,
};
