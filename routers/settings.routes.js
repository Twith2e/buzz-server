import express from "express";
const router = express.Router();

import {
  updateSettings,
  getSettings,
} from "../controllers/settings.controller.js";
import { authGuard } from "../middlewares/auth.js";

router.patch("/", authGuard, updateSettings);
router.get("/", authGuard, getSettings);

export default router;
