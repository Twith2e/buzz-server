import express from "express";
const router = express.Router();

import {
  register,
  sendOTP,
  verifyOTP,
  fetchUser,
  refreshToken,
  findUserByEmail,
  addContact,
  getContactList,
  blockContact,
  updateProfile,
} from "../controllers/users.controller.js";
import { authGuard } from "../middlewares/auth.js";

router.post("/register", register);
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.get("/get-user", fetchUser);
router.post("/refresh-token", refreshToken);
router.get("/find", authGuard, findUserByEmail);
router.post("/add-contact", authGuard, addContact);
router.get("/get-contact-list", authGuard, getContactList);
router.post("/block-contact", authGuard, blockContact);
router.put("/update-profile", authGuard, updateProfile);

export default router;
