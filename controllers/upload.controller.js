import statusModel from "../models/statuses.model.js";
import dotenv from "dotenv";
import cloudinary from "cloudinary";
import generateExpiryDate from "../utils/generateExpiryDate.js";

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

const uploadMedia = async (req, res) => {
  try {
    const file = req.file;
    if (!file)
      return res.status(400).json({ status: false, error: "file missing" });
    const userId = req.user._id;
    if (!userId)
      return res.status(400).json({ status: false, error: "userId missing" });

    const result = await cloudinary.v2.uploader.upload_stream(
      {
        folder: `${process.env.UPLOADS_FOLDER}/${userId}`,
        resource_type: auto,
      },
      async (error, result) => {
        if (error)
          return res.status(500).json({ status: false, error: error.message });

        const status = new statusModeel({
          userId,
          publicId: result.public_id,
          url: result.secure_url,
          resource_type: result.resource_type,
          thumbUrl: cloudinary.v2.url(result.public_id, {
            width: 300,
            height: 300,
            crop: "fill",
            resource_type: result.resource_type,
          }),
          createdAt: new Date(),
          expiresAt: generateExpiryDate(24),
        });
        await status.save();
        return res.status(200).json({ status: true, status });
      }
    );
    result.end(req.file.buffer);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

const saveStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { publicId, secureUrl, resourceType, caption } = req.body;
    if (!userId || !publicId || !secureUrl)
      return res.status(400).json({ status: false, error: "missing fields" });
    const thumbUrl = cloudinary.url(publicId, {
      resource_type: resourceType || "image",
      width: 300,
      height: 300,
      crop: "fill",
    });
    const status = new statusModel({
      userId,
      publicId,
      url: secureUrl,
      thumbUrl,
      resourceType: resourceType || "image",
      caption,
      createdAt: new Date(),
      expiresAt: generateExpiryDate(24),
    });

    await status.save();
    res.json({ status: true, status });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

const getStatuses = async (req, res) => {
  try {
    const userId = req.user._id;
    const userIds = (req.query.userIds || "").split(",").filter(Boolean);
    const users = [...userIds, userId];
    const now = new Date();
    const statuses = await statusModel
      .find({
        userId: { $in: users },
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1 });
    return res.json({ status: true, statuses });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export { getSigned, uploadMedia, saveStatus, getStatuses };
