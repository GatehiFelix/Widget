import jwt from 'jsonwebtoken';
import  asyncHandler  from 'express-async-handler';
import logger from '../utils/logger.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
import { RefreshToken,  Client} from '../models/index.js';

/**
 * Public endpoint — widget calls this on load with tenant API key
 * POST /auth/widget-session
 */
export const issueWidgetSession = asyncHandler(async (req, res) => {
    const { api_key } = req.body;

    // Look up tenant by their API key
    const tenant = await Client.findOne({ api_key });
    if (!tenant) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    // Create an anonymous session ID for this widget user
    const sessionId = crypto.randomUUID();

    const accessToken = generateAccessToken(sessionId, tenant.id);
    const refreshToken = generateRefreshToken(sessionId, tenant.id);

    // Persist refresh token so we can validate + rotate it later
    await RefreshToken.create({
        token: refreshToken,
        session_id: sessionId,
        tenant_id: tenant.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    logger.info(`Widget session issued for tenant ${tenant.id}`);

    res.json({
        success: true,
        accessToken,
        refreshToken,
        expiresIn: 15 * 60, // seconds — widget uses this to schedule refresh
    });
});

/**
 * Refresh endpoint — widget calls this when access token is expiring
 * POST /auth/refresh
 */
export const refreshSession = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, error: 'No refresh token' });

    let decoded;
    try {
        decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    const stored = await RefreshToken.findOne({ where: { token: refreshToken } });
    if (!stored) return res.status(401).json({ success: false, error: 'Token reused or revoked' });

    await RefreshToken.destroy({ where: { token: refreshToken } });

    const newAccessToken = generateAccessToken(decoded.sessionId, decoded.tenantId);
    const newRefreshToken = generateRefreshToken(decoded.sessionId, decoded.tenantId);

    await RefreshToken.create({
        token: newRefreshToken,
        session_id: String(decoded.sessionId),
        tenant_id: String(decoded.tenantId),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: 15 * 60 });
});

/**
 * Protect middleware — same idea as yours but uses the access secret
 * and validates the token type
 */
export const protect = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        if (decoded.type !== 'access') {
            return res.status(401).json({ success: false, error: 'Wrong token type' });
        }

        req.session = {
            sessionId: decoded.sessionId,
            tenantId: decoded.tenantId,
        };

        logger.info(`Session ${decoded.sessionId} authenticated for tenant ${decoded.tenantId}`);
        next();
    } catch (error) {
        logger.error(`Access token verification failed: ${error.message}`);

        // Tell the widget specifically that it needs to refresh
        const isExpired = error.name === 'TokenExpiredError';
        res.status(401).json({
            success: false,
            error: isExpired ? 'Token expired' : 'Token invalid',
            code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        });
    }
});
