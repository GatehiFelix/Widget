import { Router } from "express";
import {
  serveWidgetLoader,
  getWidgetSnippet,
  rotateWidgetKey,
} from "#controllers/widgetScriptController.js";
import { syncClientFromCRM } from "#controllers/clientController.js";
import { protectCRM } from "#middleware/authMiddleware.js";

const router = Router();

// Called by the CRM-generated embed snippet on the client's website.
// ?clientId=X&productId=Y are passed by the CRM.
router.get("/widget/loader.js", serveWidgetLoader);

// CRM calls this to fetch the embed snippet for a client.
// GET /api/clients/4/widget/snippet?productId=456
router.get(
  "/api/clients/:clientId/widget/snippet",
  protectCRM,
  getWidgetSnippet,
);
router.post("/api/clients/sync", protectCRM, syncClientFromCRM);
// Invalidates the current widget key for a client and issues a new one.
// productId is sent in the request body.
router.post(
  "/api/clients/:clientId/widget/rotate-key",
  protectCRM,
  rotateWidgetKey,
);

export default router;