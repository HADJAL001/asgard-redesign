import db from '../db/database';

console.log('✅ DB test:', db.prepare('SELECT 1').get());
