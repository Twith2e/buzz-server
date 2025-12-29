import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import generateAccessToken from "../utils/generateAccessToken.js";
import generateRefreshToken from "../utils/generateRefreshToken.js";
import { redisClient } from "../config/redis.connection.js";
import userModel from "../models/users.model.js";
import contactModel from "../models/contacts.model.js";
import jwt from "jsonwebtoken";
import { generateOTP, storeOTP } from "../utils/otp.js";
import sendMail from "../utils/email.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";

dotenv.config();

const sendOTP = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    let verifiedEmail;
    try {
      verifiedEmail = jwt.verify(email, process.env.JWT_SECRET);
    } catch {
      verifiedEmail = email;
    }

    const generatedOTP = generateOTP();
    const templatePath = path.join(
      process.cwd(),
      "/templates/emails/otp-email.html"
    );

    const htmlTemplate = fs.readFileSync(templatePath, "utf-8");
    const html = htmlTemplate.replace("{{OTP_CODE}}", generatedOTP);

    const mailResult = await sendMail(verifiedEmail, "Verify your email", html);

    if (!mailResult.success) {
      return res.status(500).json({
        error: "Unable to send mail",
        details: mailResult.error,
      });
    }

    const hashedEmail = jwt.sign(verifiedEmail, process.env.JWT_SECRET);
    await storeOTP(hashedEmail, generatedOTP);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      email,
      hashedEmail,
    });
  } catch (error) {
    console.error("sendOTP error:", error);
    return res.status(500).json({ error: "Internal Server Error", error });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { otp, email } = req.body;
    if (!otp || !email) {
      return res.status(400).json({
        error: "Missing required parameters",
      });
    }
    let isNewUser = false;
    let accessToken;
    let refreshToken;
    try {
      const verifiedEmail = jwt.verify(email, process.env.JWT_SECRET);
      const existingUser = await userModel.findOne({ email: verifiedEmail });
      if (existingUser) {
        isNewUser = true;
      }
      if (isNewUser) {
        accessToken = generateAccessToken({ email: verifiedEmail });
        refreshToken = await generateRefreshToken({
          email: verifiedEmail,
        });
        if (accessToken && refreshToken) {
          const isProd = process.env.NODE_ENV === "production";
          res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
          });
        }
      }
      const storedOTP = await redisClient.get(`otp:${email}`);
      if (!storedOTP)
        return res.status(401).json({ error: "Invalid or expired otp" });
      if (storedOTP === otp) {
        const deletedOtp = await redisClient.del(`otp:${email}`);
        if (!deletedOtp)
          return res.status(500).json({ error: "An error occured" });
        return res.status(200).json({
          message: "Otp is valid",
          email,
          hashedEmail: verifiedEmail,
          isNewUser,
          accessToken,
          refreshToken,
        });
      }
      return res.status(401).json({ error: "Incorrect OTP" });
    } catch (error) {
      return res.status(500).json({ error: "Invalid Token" });
    }
  } catch (error) {
    console.log("verification error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const register = async (req, res) => {
  try {
    const { email, displayName } = req.body;
    if (!email || !displayName) {
      return res.status(400).json({
        error: "Missing required parameters",
        details: {
          displayName: !displayName ? "Missing display name" : null,
          email: !email ? "Missing email" : null,
        },
      });
    }
    try {
      let verifiedEmail;
      try {
        verifiedEmail = jwt.verify(email, process.env.JWT_SECRET);
      } catch (_err) {
        verifiedEmail = email;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (
        typeof verifiedEmail !== "string" ||
        !emailRegex.test(verifiedEmail)
      ) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const existingUser = await userModel.findOne({ email: verifiedEmail });
      if (existingUser) {
      }
      const data = {
        email: verifiedEmail,
        displayName,
      };
      const registeredUser = await userModel.create(data);
      if (!registeredUser)
        return res
          .status(400)
          .json({ error: "Unable to create profile, please try again" });
      const accessToken = generateAccessToken(registeredUser);
      const refreshToken = await generateRefreshToken(registeredUser);
      if (accessToken && refreshToken) {
        const isProd = process.env.NODE_ENV === "production";
        res.cookie("refreshToken", refreshToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: isProd ? "none" : "lax",
          path: "/",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        return res.status(200).json({
          message: "Profile created successfully",
          success: true,
          accessToken,
          email,
        });
      } else {
        console.log("Refresh Token or Access Token is missing");
      }
    } catch (error) {
      console.log("register-jwt-error: ", error);
      return res.status(500).json({ error: "Invalid email" });
    }
  } catch (error) {
    console.log("registration-error: ", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const refreshToken = async (req, res) => {
  const rtCookie = req.cookies?.refreshToken;
  const rtHeader = req.headers.cookie
    ?.split("; ")
    ?.find((cookie) => cookie.startsWith("refreshToken="))
    ?.split("=")[1];
  const refreshToken = typeof rtCookie === "string" ? rtCookie : rtHeader;

  if (typeof refreshToken !== "string")
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await userModel.findOne({ email: decoded.email });
    if (!user) return res.status(404).json({ error: "User not found" });
    const accessToken = generateAccessToken(user);
    return res.status(200).json({
      message: "Token refreshed successfully",
      success: true,
      accessToken,
      email: user.email,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Unauthorized: Token expired" });
    }
    console.log("refresh-token-error: ", error);
    return res.status(500).json({ error: "Invalid token" });
  }
};

const fetchUser = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized: Missing or malformed Authorization header",
      });
    }
    const token = authHeader.split(" ")[1];
    if (!token)
      return res.status(401).json({ error: "Unauthorized: Token missing" });
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await userModel
        .findOne({ email: decoded.email })
        .select("_id email profilePic lastSeen displayName status meta");
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({ status: true, user });
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Unauthorized: Token expired" });
      }
      return res.status(500).json({ error: "Invalid token" });
    }
  } catch (error) {
    console.log("fetching-user-error: ", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const findUserByEmail = async (req, res) => {
  const { email } = req.query;

  try {
    if (!email) return res.status(400).json({ error: "Email is required" });
    const user = await userModel
      .findOne({ email })
      .select("_id email displayName, profilePic")
      .lean();
    if (!user)
      return res.status(404).json({ matched: false, error: "User not found" });
    return res.status(200).json({ matched: true, user });
  } catch (error) {
    console.log("find-user-by-email-error: ", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const addContact = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const { friendEmail, localName } = req.body;
    const email = normalizeEmail(friendEmail);
    if (!email) return res.status(400).json({ error: "Invalid email" });

    const matchedUser = await userModel
      .findOne({
        email,
      })
      .select("_id email displayName, profilePic")
      .lean();
    const contactId = matchedUser ? matchedUser._id : null;

    const filter = { owner: ownerId, email };
    const update = {
      $set: {
        localName,
        contactUser: contactId,
        matchedAt: contactId ? new Date() : null,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    };

    const savedContact = await contactModel.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
    });

    return res.status(200).json({
      message: "Friend added successfully",
      success: true,
      contact: {
        _id: savedContact._id,
        email: savedContact.email,
        localName: savedContact.localName,
        matched: !!contactId,
        user: matchedUser
          ? {
              _id: matchedUser._id,
              name: matchedUser.name,
              avatarUrl: matchedUser.avatarUrl,
            }
          : null,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "conflict" });
    }
    console.error(error);
    return res.status(500).json({ error: "internal_error" });
  }
};

const getContactList = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const contacts = await contactModel.aggregate([
      { $match: { owner: ownerId } },
      { $sort: { updateAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "contactUser",
          foreignField: "_id",
          as: "contactProfile",
        },
      },
      {
        $unwind: { path: "$contactProfile", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          email: 1,
          localName: 1,
          isBlocked: 1,
          contactProfile: {
            _id: "$contactProfile._id",
            displayName: "$contactProfile.displayName",
            profilePic: "$contactProfile.profilePic",
            lastSeen: "$contactProfile.lastSeen",
          },
        },
      },
    ]);
    return res.status(200).json({
      message: "Contact list fetched successfully",
      success: true,
      contacts,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "internal_error" });
  }
};

const blockContact = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const { contactEmail } = req.query;
    const email = normalizeEmail(contactEmail);
    if (!email) return res.status(404).json({ error: "Email not found" });
    const filter = { owner: ownerId, email };
    const update = {
      $set: {
        isBlocked: true,
        updatedAt: new Date(),
      },
    };
    const updatedContact = await contactModel.findOneAndUpdate(filter, update, {
      new: true,
    });

    return res.status(200).json({
      message: "Contact blocked successfully",
      success: true,
      contact: updatedContact,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "internal_error" });
  }
};

const getContactsForUser = async (userId) => {
  try {
    const contacts = await contactModel.find({ owner: userId });
    return contacts;
  } catch (error) {
    console.log(error);
  }
};

export {
  register,
  sendOTP,
  verifyOTP,
  fetchUser,
  refreshToken,
  findUserByEmail,
  addContact,
  getContactList,
  blockContact,
  getContactsForUser,
};
