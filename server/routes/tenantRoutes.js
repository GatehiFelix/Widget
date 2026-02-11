import express from 'express';
import {
  listTenantsController,
  getTenantController,
  deleteTenantController
} from '#controllers/tenantController.js';
import { protect, adminOnly } from '#middleware/authMiddleware.js';
import { validateTenantId } from '#middleware/validateMiddleware.js';

const router = express.Router();

// router.route('/')
//   .get(protect, adminOnly, listTenantsController);

// router.route('/:tenant_id')
//   .get(protect, validateTenantId, getTenantController)
//   .delete(protect, adminOnly, validateTenantId, deleteTenantController);

router.route('/')
  .get( listTenantsController);

router.route('/:tenant_id')
  .get(validateTenantId, getTenantController)
  .delete(validateTenantId, deleteTenantController);


export default router;