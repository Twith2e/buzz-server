import statusModel from "../models/statuses.model.js";
import dotenv from "dotenv";
import cloudinary from "cloudinary";
import contactModel from "../models/contacts.model.js";
import mongoose from "mongoose";

dotenv.config();

const getSigned = async (req, res) => {
  const userId = req.user._id;
  if (!userId) return res.status(404).json({ error: "userId required" });

  let { folder } = req.body;

  const timestamp = Math.floor(Date.now() / 1000);
  if (!folder) {
    folder = `${process.env.UPLOADS_FOLDER}/${userId}`;
  } else {
    folder = `${folder}/${userId.toString()}`;
  }

  const options = {
    timestamp,
    folder,
    eager: "c_scale,w_800",
    type: "upload",
    access_mode: "public",
  };

  try {
    const signature = cloudinary.v2.utils.api_sign_request(
      options,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.status(200).json({
      signature,
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      folder,
      resource_type: "auto",
      eager: "c_scale,w_800",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getStatuses = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    // get who added viewer & mutuals as before
    const myContacts = await contactModel
      .find({ owner: userId, contactUser: { $ne: null }, isBlocked: false })
      .distinct("contactUser")
      .exec();

    if (!myContacts.length)
      return res.json({ status: true, mine: [], visible: [] });

    const mutualDocs = await contactModel
      .find({
        owner: { $in: myContacts },
        contactUser: userId,
        isBlocked: false,
      })
      .distinct("owner")
      .exec();

    if (!mutualDocs.length)
      return res.json({ status: true, mine: [], visible: [] });

    const pipeline = [
      {
        $match: {
          userId: {
            $in: mutualDocs.map((id) => new mongoose.Types.ObjectId(id)),
          },
          expiresAt: { $gt: now },
        },
      },
      { $sort: { createdAt: -1 } }, // newest first
      {
        $group: {
          _id: "$userId",
          latest: { $first: "$createdAt" },
          total: { $sum: 1 },
          statuses: {
            $push: {
              _id: "$_id",
              createdAt: "$createdAt",
              publicId: "$publicId",
              url: "$url",
              thumbUrl: "$thumbUrl",
              resourceType: "$resourceType",
              viewers: "$viewers",
              caption: "$caption",
              userId: "$userId",
              expiresAt: "$expiresAt",
              __v: "$__v",
            },
          },
        },
      },
      {
        $project: {
          userId: "$_id",
          latest: 1,
          total: 1,
          statuses: { $slice: ["$statuses", 10] },
        },
      }, // keep last 10
      { $sort: { latest: -1 } },
      // join user profile
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: 1,
          latest: 1,
          total: 1,
          statuses: 1,
          "user.displayName": 1,
          "user.profilePic": 1,
        },
      },
    ];

    const groups = await statusModel.aggregate(pipeline).exec();

    // optional massage: rename fields so client expects same shape as previous
    const visible = groups.map((g) => ({
      _id: g.userId,
      displayName: g.user?.displayName || "Unknown",
      profilePic: g.user?.profilePic || null,
      latest: g.latest,
      total: g.total,
      statuses: g.statuses.reverse(), // if you prefer oldest->newest inside slice
    }));

    // mine (fetch separately or include in pipeline if you want)
    const mine = await statusModel
      .find({ userId, expiresAt: { $gt: now } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return res.json({ status: true, mine, visible });
  } catch (err) {
    console.error("getStatusesAggregated error:", err);
    return res.status(500).json({ error: err.message });
  }
};

export { getSigned, getStatuses };
