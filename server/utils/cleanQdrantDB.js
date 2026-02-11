import axios from "axios";
import logger from "./logger.js";

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
          .then(() => logger.info(`Deleted collection: ${name}`))
          .catch((err) => logger.error(`Failed to delete collection ${name}: ${err.message}`))
      )
    );
    logger.info("Qdrant cleanup complete.");
  } catch (error) {
    logger.error("Error cleaning Qdrant DB:", error);
  }
};
