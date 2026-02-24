import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const generateAccessToken = (sessionId, tenantId) => {
    return jwt.sign(
        { sessionId, tenantId, type: 'access'},
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
    );
};

export const generateRefreshToken = (sessionId, tenantId) => {
    return jwt.sign(
        { sessionId, tenantId, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
};

export const generateOpaqueToken = () => crypto.randomBytes(40).toString('hex');