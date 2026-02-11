import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

/**
 * @desc General rate limiter
 */
export const generalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            error: 'Too many requests, please try again later.'
        });
    }
});

/**
 * @desc Strict rate limiter for sensitive operations
 */
export const strictRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Strict rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            error: 'Too many requests, please try again later.'
        });
    }
});

/**
 * @desc Authentication rate limiter
 */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per windowMs
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            error: 'Too many login attempts, please try again later.'
        });
    }
});
