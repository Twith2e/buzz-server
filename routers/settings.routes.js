import express from "express";
const router = express.Router();

import { updateSettings } from "../controllers/settings.controller.js";
import { authGuard } from "../middlewares/auth.js";

router.patch("/", authGuard, updateSettings);

export default router;
