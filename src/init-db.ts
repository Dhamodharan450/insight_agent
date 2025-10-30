import { ensureTables } from './tools/db_tools';

async function initDatabase() {
  console.log('Initializing database tables...');
  try {
    await ensureTables();
    console.log('✓ Database tables created successfully!');
    console.log('  - kpi table');
    console.log('  - insight table');
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to initialize database:', error);
    process.exit(1);
  }
}

initDatabase();
