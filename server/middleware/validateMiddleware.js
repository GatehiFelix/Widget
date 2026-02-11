import {
    validateTenantId as checkTenantId,
    validateQuestion as checkQuestion,
    ValidationError
} from '../utils/validators.js';

/**
 * @desc Validate query request
 */
export const validateQuery = (req, res, next) => {
  try {
    const question = req.body.question;
    checkQuestion(question);
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        field: error.field
      });
    }
    next(error);
  }
};

/**
 * @desc Validate tenant ID
 */
export const validateTenantId = (req, res, next) => {
  try {
    // Get tenant_id from body or params
    const tenantId = req.body.tenant_id || req.params.tenant_id;
    
    const tenantIdStr = String(tenantId);
    
    // Validate using the function from validators.js
    checkTenantId(tenantIdStr);
    
    // Store normalized value back
    if (req.body.tenant_id) {
      req.body.tenant_id = tenantIdStr;
    }
    if (req.params.tenant_id) {
      req.params.tenant_id = tenantIdStr;
    }
    
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        field: error.field
      });
    }
    next(error);
  }
};