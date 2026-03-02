import crypto from "crypto";
import {Client} from "#models/index.js";
import logger from "#utils/logger.js";

const BASE_URL = process.env.APP_BASE_URL || "http://localhost:8080";
const WIDGET_SCRIPT_SECRET =
  process.env.WIDGET_SCRIPT_SECRET || "change_me_in_production";

const toHex = (value) => Buffer.from(String(value)).toString("hex");
const fromHex = (hex) => Buffer.from(hex, "hex").toString("utf8");

const sign = (payload) =>
  crypto
    .createHmac("sha256", WIDGET_SCRIPT_SECRET)
    .update(payload)
    .digest("hex");

const safeCompare = (a, b) => {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

/**
 * Generate an HMAC-signed widget key tied to a specific client + product_id pair.
 * Format: <clientId_hex>.<productId_hex>.<hmac_sig>
 *
 * @param {number|string} clientId   - client.id
 * @param {number|string} productId  - client.product_id (CRM reference)
 * @param {string}        [salt=""]  - rotation salt stored on the client record
 * @returns {string} widgetKey
 */
const generateWidgetKey = (clientId, productId, salt = "") => {
  const sig = sign(`widget:${clientId}:${productId}:${salt}`);
  return `${toHex(clientId)}.${toHex(productId)}.${sig}`;
};

/**
 * Verify an incoming widget key.
 * Pass the salt from the client record (empty string if none set).
 *
 * @param {string} widgetKey
 * @param {string} [salt=""]
 * @returns {{ clientId: number, productId: number } | null}
 */
const verifyWidgetKey = (widgetKey, salt = "") => {
  try {
    const parts = widgetKey.split(".");
    if (parts.length !== 3) return null;

    const [clientIdHex, productIdHex, sig] = parts;
    if (!clientIdHex || !productIdHex || !sig) return null;

    const clientId = fromHex(clientIdHex);
    const productId = fromHex(productIdHex);
    const expected = sign(`widget:${clientId}:${productId}:${salt}`);

    if (!safeCompare(sig, expected)) return null;

    return { clientId: Number(clientId), productId: Number(productId) };
  } catch {
    return null;
  }
};


const initWidgetFromCRM = async (clientId, productId) => {
  if (!clientId || !productId) {
    throw new Error("clientId and productId are required");
  }

  const client = await Client.findOne({
    where: { id: clientId, product_id: productId },
  });

  if (!client) {
    throw new Error(
      `No client found for clientId=${clientId} and productId=${productId}.`
    );
  }

  //  Kill switch check
  if (client.widget_active === false) {
    throw new Error(`Widget is disabled for client ${clientId}.`);
  }

  const salt = client.widget_salt || "";
  const widgetKey = generateWidgetKey(clientId, productId, salt);

  // Record first activation timestamp
  if (!client.widget_activated_at) {
    await client.update({ 
      widget_activated_at: new Date(),
      last_active_at: new Date(),
    });
  }

  const config = {
    widgetKey,
    apiBase: BASE_URL,
    primaryColor: client.widget_primary_color || "#6366f1",
    position: client.widget_position || "bottom-right",
    welcomeMessage: client.widget_welcome_message || "Hi there 👋 How can we help you today?",
    launcherText: client.widget_launcher_text || "Chat with us",
  };

  logger.info(
    `Widget initialised — clientId: ${clientId}, productId: ${productId}, client: "${client.name}"`,
  );

  return {
    widgetKey,
    config,
    client: {
      id: client.id,
      name: client.name,
      productId: client.product_id,
      plan: client.plan,            // ✅ now included
      widgetActive: client.widget_active,
      activatedAt: client.widget_activated_at,
    },
  };
};


/**
 * Rotate the widget key for a client.
 * Stores a new random salt on the client record — the old embed key
 * immediately becomes invalid.
 *
 * Requires these nullable columns on the client table:
 *   - widget_salt           VARCHAR  (rotation salt)
 *   - widget_primary_color  VARCHAR  (optional display config)
 *   - widget_position       VARCHAR  (optional display config)
 *   - widget_welcome_message TEXT    (optional display config)
 *
 * @param {number} clientId
 * @param {number} productId
 * @returns {{ widgetKey: string }}
 */
const rotateWidgetKey = async (clientId, productId) => {
  if (!clientId || !productId)
    throw new Error("clientId and productId are required");

  const client = await Client.findOne({
    where: { id: clientId, product_id: productId },
  });

  if (!client)
    throw new Error(
      `No client found for clientId=${clientId} and productId=${productId}`,
    );

  const newSalt = crypto.randomBytes(16).toString("hex");
  await client.update({ widget_salt: newSalt });

  const widgetKey = generateWidgetKey(clientId, productId, newSalt);

  logger.info(`Widget key rotated — clientId: ${clientId}, productId: ${productId}`);

  return { widgetKey };
};




export const WidgetScriptService = {
  initWidgetFromCRM,  
  generateWidgetKey,  
  verifyWidgetKey,    
  rotateWidgetKey,    
};