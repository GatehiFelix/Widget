import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';



export const listTenantsController = asyncHandler(async (req, res) => {
  logger.info('Fetching all tenants');
  
  const tenants = await req.ragApp.listTenants();
  
  res.status(200).json({
    success: true,
    data: {
      tenants,
      count: tenants.length
    }
  });
});

/* 
* @desc    Get tenant details
* @route   GET /api/tenants/:tenant_id
* @access  Protected
*/
export const getTenantController = asyncHandler(async (req, res) => {
  const { tenant_id } = req.params;
  
  logger.info(`Fetching details for tenant ${tenant_id}`);
  
  const stats = await req.ragApp.getTenantStats(tenant_id);
  
  res.status(200).json({
    success: true,
    data: stats
  });
});


/**
 * @desc delete a tenant and all data
 * @route DELETE /api/tenants/:tenant_id
 * @access Protected
 */


export const deleteTenantController = asyncHandler(async (req, res) => {
  const { tenant_id } = req.params;
  
  logger.info(`Deleting tenant ${tenant_id}`);
  
  await req.ragApp.deleteTenant(tenant_id);
  
  res.status(200).json({
    success: true,
    message: `Tenant ${tenant_id} deleted successfully`
  });
});

