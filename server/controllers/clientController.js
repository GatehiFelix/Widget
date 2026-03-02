import { Client, WidgetConfig } from "#models/index.js";
import logger from "#utils/logger.js";


/**
 * 
 */
export const syncClientFromCRM = async (req, res) => {
  try {
    const {
      id,
      product_id,
      name,
      phone,
      website_url,
      industry,
      plan,
      max_concurrent_chats,
      monthly_conversation_limit,
      rag_enabled,
      allowed_origins,
      // Widget fields
      widget_name,
      widget_primary_color,
      widget_position,
      widget_welcome_message,
      widget_launcher_text,
      widget_active,
    } = req.body;

    if (!id || !product_id || !name) {
      return res.status(400).json({
        success: false,
        message: "id, product_id, and name are required",
      });
    }

    // ✅ Upsert client
    const [client, clientCreated] = await Client.upsert(
      {
        id,
        product_id,
        name,
        phone:                      phone || null,
        website_url:                website_url || null,
        industry:                   industry || null,
        plan:                       plan || "free",
        max_concurrent_chats:       max_concurrent_chats || 100,
        monthly_conversation_limit: monthly_conversation_limit || null,
        rag_enabled:                rag_enabled !== undefined ? rag_enabled : true,
        allowed_origins:            allowed_origins || null,
        updated_at:                 new Date(),
      },
      { returning: true }
    );

    // ✅ Upsert widget config separately
    const existingWidget = await WidgetConfig.findOne({
      where: { client_id: id },
    });

    if (existingWidget) {
      await existingWidget.update({
        widget_name:    widget_name || existingWidget.widget_name,
        primary_color:   widget_primary_color || existingWidget.primary_color,
        position:        widget_position      || existingWidget.position,
        welcome_message: widget_welcome_message || existingWidget.welcome_message,
        launcher_text:   widget_launcher_text   || existingWidget.launcher_text,
        ...(widget_active !== undefined && { widget_active }),
        updated_at: new Date(),
      });
    } else {
      await WidgetConfig.create({
        client_id:       id,
        primary_color:   widget_primary_color   || "#6366f1",
        position:        widget_position         || "bottom-right",
        welcome_message: widget_welcome_message  || "Hi there 👋 How can we help you today?",
        launcher_text:   widget_launcher_text    || "Chat with us",
        widget_active:   widget_active !== undefined ? widget_active : true,
      });
    }

    logger.info(
      `Client ${clientCreated ? "created" : "updated"} — id: ${id}, name: "${name}"`
    );

    return res.json({
      success: true,
      action: clientCreated ? "created" : "updated",
      client: {
        id,
        name,
        product_id,
        plan: plan || "free",
      },
    });
  } catch (err) {
    logger.error("syncClientFromCRM error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

