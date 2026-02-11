import jwt from 'jsonwebtoken';
import { asyncHandler } from './asyncHandler.js';
import logger from '../utils/logger.js';

/**
 * @desc Protect routes - verify JWT token
 */
export const protect = asyncHandler(async (req, res, next) => {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Add user info to request
            req.user = {
                id: decoded.id,
                tenant_id: decoded.tenant_id,
                role: decoded.role,
            };

            logger.info(`User ${decoded.id} authenticated for tenant ${decoded.tenant_id}`);
            next();
        } catch (error) {
            logger.error(`Token verification failed: ${error.message}`);
            res.status(401).json({
                success: false,
                error: 'Not authorized, token failed'
            });
        }
    }

    if (!token) {
        logger.warn('Access attempt without token');
        res.status(401).json({
            success: false,
            error: 'Not authorized, no token'
        });
    }
});

/**
 * @desc Admin only access
 */
export const adminOnly = asyncHandler(async (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        logger.info(`Admin access granted for user ${req.user.id}`);
        next();
    } else {
        logger.warn(`Admin access denied for user ${req.user?.id || 'unknown'}`);
        res.status(403).json({
            success: false,
            error: 'Not authorized, admin access only'
        });
    }
});

/**
 * @desc Generate JWT token
 * @param {string} id - User ID
 * @param {string} tenant_id - Tenant ID
 * @param {string} role - User role (admin, user)
 * @returns {string} JWT token
 */
export const generateToken = (id, tenant_id, role = 'user') => {
    return jwt.sign(
        { id, tenant_id, role },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
};
