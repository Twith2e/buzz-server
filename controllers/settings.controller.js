import settingModel from "../models/settings.model.js";
import userModel from "../models/users.model.js";

const updateSettings = async (req, res) => {
  try {
    const userId = req.user._id;

    // Optional: Check if user exists (though req.user usually implies existence)
    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const payload = req.body;
    const allowed = ["notification", "theme", "language"];
    const patch = {};

    for (const k of allowed) {
      if (payload[k] !== undefined) patch[k] = payload[k];
    }

    if (!Object.keys(patch).length)
      return res.status(400).json({ error: "nothing_to_update" });

    const updated = await settingModel
      .findOneAndUpdate(
        { userId },
        { $set: patch },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      .lean()
      .exec();

    return res.json({ status: true, settings: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

const getSettings = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const settings = await settingModel.findOne({ userId }).lean().exec();
    return res.json({ status: true, settings });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

export { updateSettings, getSettings };
