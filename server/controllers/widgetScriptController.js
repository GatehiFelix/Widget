import { WidgetScriptService } from "#services/widgetScriptService.js";
import logger from "#utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Widget loader — public, called on every page load from the customer's website
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /widget/loader.js?clientId=X&productId=Y
 *
 * The CRM injects this URL into the embed snippet on the client's website.
 * We validate the clientId + productId pair against our DB (synced from CRM),
 * then return a self-executing JS bundle that boots the chat widget.
 */
export const serveWidgetLoader = async (req, res) => {
  const { clientId, productId } = req.query;

  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "no-store");

  if (!clientId || !productId) {
    return res.status(400).send(
      `console.error("[Widget] clientId and productId are required.");`,
    );
  }

  try {
    const { config } = await WidgetScriptService.initWidgetFromCRM(
      clientId,
      productId,
    );

    return res.send(buildLoaderScript(config));
  } catch (err) {
    logger.error("serveWidgetLoader error:", err.message);

    // Return a silent no-op so the client's page doesn't visibly break
    const safeMsg = err.message.replace(/`/g, "'");
    return res.status(403).send(
      `console.warn("[Widget] Could not load: ${safeMsg}");`,
    );
  }
};


export const getWidgetSnippet = async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const productId = Number(req.query.productId);

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId query param is required",
      });
    }

    const { widgetKey, config, client } = await WidgetScriptService.initWidgetFromCRM(
      clientId,
      productId,
    );

    const snippet = `<script src="${process.env.APP_BASE_URL || "http://localhost:8080"}/widget/loader.js?clientId=${clientId}&productId=${productId}" async></script>`;

    return res.json({
      success: true,
      snippet,
      widgetKey,
      config,
      client,
    });
  } catch (err) {
    logger.error("getWidgetSnippet error:", err.message);
    const status = err.message.includes("not found") ? 404 : 400;
    return res.status(status).json({ success: false, message: err.message });
  }
};






/**
 * POST /api/clients/:clientId/widget/rotate-key
 * Body: { productId }
 *
 * Invalidates the current widget key for this client and issues a new one.
 * The client will need to re-embed the updated snippet.
 */
export const rotateWidgetKey = async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const productId = Number(req.body.productId);

    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: "productId is required in body" });
    }

    const { widgetKey } = await WidgetScriptService.rotateWidgetKey(
      clientId,
      productId,
    );

    return res.json({ success: true, widgetKey });
  } catch (err) {
    logger.error("rotateWidgetKey error:", err.message);
    const status = err.message.includes("not found") ? 404 : 400;
    return res.status(status).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Loader script builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the self-executing JS that runs on the customer's website.
 * Config is fully resolved server-side — no extra client fetches needed.
 *
 * In production, swap the iframe bootstrap for your compiled widget bundle.
 *
 * @param {object} config  - { widgetKey, apiBase, primaryColor, position, welcomeMessage }
 * @returns {string}
 */


const buildLoaderScript = (config) => {
  const widgetKey = config.widgetKey;
  const position = config.position || "bottom-right";
  const isLeft = position === "bottom-left";
  const widgetAppUrl = process.env.WIDGET_APP_URL || "http://localhost:3001";

  return `
(function() {
  if (document.getElementById("__support-widget-root")) return;

  var iframe = document.createElement("iframe");
  iframe.id = "__support-widget-root";
  iframe.src = "${widgetAppUrl}/widget?key=" + encodeURIComponent("${widgetKey}");

  iframe.style.cssText = [
  "position:fixed",
  "right:0px",      
  "bottom:0px",     
  "width:80px",     
  "height:80px",    
  "border:none",
  "background:transparent",
  "z-index:2147483647",
  "pointer-events:auto",
  "overflow:visible",
  "transition:width 0.3s ease, height 0.3s ease",
].join(";");

  iframe.setAttribute("allowtransparency", "true");
  iframe.setAttribute("allow", "microphone");
  iframe.scrolling = "no";
  iframe.title = "Support Chat";
  document.body.appendChild(iframe);

  window.addEventListener("message", function(e) {
    if (!e.data || typeof e.data !== "string") return;

    if (e.data === "__widget:open") {
      iframe.style.width = "${isLeft ? '500px' : '500px'}";
      iframe.style.height = "1000px";
      iframe.style.bottom = "0px";
      iframe.style.right = "24px";
    }

    if (e.data === "__widget:close") {
      iframe.style.width = "70px";
      iframe.style.height = "70px";
    }
  });
})();
  `.trim();
};