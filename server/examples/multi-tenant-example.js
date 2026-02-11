import { createRAGApplication } from '../index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const multiTenantExample = async () => {
  console.log('🏢 RAG System - Multi-tenant Example\n');
  console.log('='.repeat(60));

  const app = await createRAGApplication({
    collectionName: 'multi_tenant_docs',
  });

  // Tenant A
  console.log('\n👥 Setting up Tenant A (Company A)...');
  const tenantA = 'company_a';
  await app.indexDocument(
    path.join(__dirname, '../data/documents/doc-a.pdf'),
    tenantA,
    { company: 'Company A', type: 'docs' }
  );

  // Tenant B
  console.log('\n👥 Setting up Tenant B (Company B)...');
  const tenantB = 'company_b';
  await app.indexDocument(
    path.join(__dirname, '../data/documents/doc-b.pdf'),
    tenantB,
    { company: 'Company B', type: 'docs' }
  );

  // Query from Tenant A
  console.log('\n📝 Query from Tenant A:');
  const resultA = await app.query(tenantA, 'What are the features?');
  console.log('🤖 Answer:', resultA.answer.substring(0, 200) + '...');

  // Query from Tenant B
  console.log('\n📝 Query from Tenant B:');
  const resultB = await app.query(tenantB, 'What are the features?');
  console.log('🤖 Answer:', resultB.answer.substring(0, 200) + '...');

  // List all tenants
  console.log('\n📊 All tenants:');
  const tenants = await app.listTenants();
  console.log(tenants);

  // Get stats for each tenant
  for (const tenant of tenants) {
    const stats = await app.getTenantStats(tenant);
    console.log(`\n${tenant}:`, stats);
  }

  console.log('\n' + '='.repeat(60));
};

// Run the example
multiTenantExample().catch(console.error);
