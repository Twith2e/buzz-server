import express from "express";
import { getSigned, getStatuses } from "../controllers/upload.controller.js";
import { authGuard } from "../middlewares/auth.js";
const router = express.Router();

router.post("/sign", authGuard, getSigned);
router.get("/statuses", authGuard, getStatuses);

export default router;
