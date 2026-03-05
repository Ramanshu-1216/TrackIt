import fs from 'fs';
import path from 'path';

// Manually load .env.local 
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) return;
    const [key, ...values] = trimmedLine.split('=');
    if (key && values.length > 0) {
      process.env[key.trim()] = values.join('=').trim().replace(/^"(.*)"$/, '$1');
    }
  });
}

async function main() {
  const { default: dbConnect } = await import('../lib/dbConnect');
  const { default: mongoose } = await import('mongoose');
  const { default: Order } = await import('../models/Order');
  const { default: Subscription } = await import('../models/Subscription');

  await dbConnect();
  
  const o = await Order.deleteMany({});
  const s = await Subscription.deleteMany({});
  
  console.log('Deleted Orders:', o.deletedCount, 'Subs:', s.deletedCount);
  await mongoose.disconnect();
}

main().catch(e => console.error(e));
