import messageModel from "../models/messages.model.js";
import conversationModel from "../models/conversations.model.js";
import userModel from "../models/users.model.js";

/**
 * normalizeAttachments
 * Ensures each attachment is an object with expected fields.
 * Fixes historical data where a URL string was spread into an object of char indices.
 */
function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((a) => {
    // Already in correct shape
    if (a && typeof a === "object" && a.url) return a;

    // Attachment saved as a raw string
    if (typeof a === "string") {
      const url = a;
      const formatMatch = url.toLowerCase().match(/\.([a-z0-9]+)(?:\?|#|$)/);
      return { url, format: formatMatch ? formatMatch[1] : undefined };
    }

    // Attachment saved as an object of character indices: {"0":"h","1":"t",...}
    if (a && typeof a === "object" && !a.url) {
      const charKeys = Object.keys(a).filter((k) => /^\d+$/.test(k));
      if (charKeys.length) {
        const url = charKeys
          .sort((x, y) => Number(x) - Number(y))
          .map((k) => a[k])
          .join("");
        const formatMatch = url.toLowerCase().match(/\.([a-z0-9]+)(?:\?|#|$)/);
        const normalized = {
          url,
          format: formatMatch ? formatMatch[1] : undefined,
        };
        // Preserve subdoc _id if present
        if (a._id) normalized._id = a._id;
        return normalized;
      }
    }

    // Fallback: return as-is
    return a;
  });
}

const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await conversationModel
      .find({
        participants: userId,
      })
      .sort({ lastMessageAt: -1 })
      .populate("participants", "email displayName profilePic")
      .populate("lastMessage");

    if (!conversations)
      return res.status(404).json({ message: "No conversations found" });
    res.status(200).json({ status: true, conversations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { before, limit = 20 } = req.query;
    const query = { conversation: conversationId };
    if (before) {
      query._id = { $lt: before };
    }
    const rawMessages = await messageModel
      .find(query)
      .limit(Number(limit))
      .populate("from", "email displayName profilePic")
      .populate("taggedMessage")
      .populate("taggedMessage.from", "email displayName profilePic");
    if (!rawMessages)
      return res.status(404).json({ message: "No messages found" });

    const messages = rawMessages.map((m) => {
      const obj = m.toObject();
      obj.attachments = normalizeAttachments(obj.attachments);
      return obj;
    });

    res.status(200).json({
      status: true,
      messages,
      hasMore: rawMessages.length === Number(limit),
      nextCursor: rawMessages[0]?._id || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getConversations, getMessages };
