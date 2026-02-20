import express from 'express';
import { getExternalAgents } from '#services/externalAgentDbService.js';

const router = express.Router();

router.get('/external', async (req, res) => {
    const { client_id, status, department } = req.query;

    if (!client_id) {
        return res.status(400).json({ error: 'client_id is required' });
    }

    const agents = await getExternalAgents(Number(client_id));
    res.json({ agents });
});

export default router;