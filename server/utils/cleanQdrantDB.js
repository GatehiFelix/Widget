import axios from "axios";
import logger from "./logger.js";
import { ClientDocument } from "#models/index.js";

export const cleanAllCollections = async () => {
  try {
    const { data } = await axios.get(`${process.env.QDRANT_URL}/collections`);
    // Qdrant returns { result: { collections: [...] } }
    const collections = (data.result && data.result.collections) || [];

    if (collections.length === 0) {
      logger.info("No collections to delete in Qdrant.");
      return;
    }

    await Promise.all(
      collections.map(({ name }) =>
        axios
          .delete(`${process.env.QDRANT_URL}/collections/${name}`)
          .then(async () => {
            logger.info(`Deleted collection: ${name}`);
            // Sync DB: the collection name IS the tenant_id
            await ClientDocument.destroy({ where: { tenant_id: String(name) } });
            logger.info(`Cleared DB documents for tenant ${name}`);
          })
          .catch((err) => logger.error(`Failed to delete collection ${name}: ${err.message}`))
      )
    );
    logger.info("Qdrant + DB cleanup complete.");
  } catch (error) {
    logger.error("Error cleaning Qdrant DB:", error);
  }
};
