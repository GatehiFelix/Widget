import express from 'express';
import { healthCheckController } from '#controllers/qdrantHealthCheckerController.js';


const router = express.Router();

router.route('/').get(healthCheckController);

export default router;