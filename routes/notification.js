import { Router } from "express";
const router = Router();
import {
  addNotification,
  
  // createNotification,
  
  // getNotifications,
  
  getOrCreateNotifications,
  
  removeNotification,
} from "../controllers/notification.js";

router
  .route("/")
  // .get(getNotifications)
  // .post(createNotification)
  .get(getOrCreateNotifications)
  .put(addNotification)
  .post(removeNotification);
export default router;
