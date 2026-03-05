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

  await dbConnect();
  
  const accounts = await mongoose.connection.db?.collection('accounts').find({ provider: 'google' }).toArray();
  
  if (!accounts || accounts.length === 0) {
    console.log("No users with Google accounts found in DB.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${accounts.length} potential users. Trying first one...`);
  const account = accounts[0];
  const userId = account.userId.toString();
  console.log("Testing with User ID:", userId);

  const { scanForOrders } = await import('../lib/gmailService');
  const result = await scanForOrders(userId);
  console.log("Sync Result:", JSON.stringify(result, null, 2));
  
  await mongoose.disconnect();
}

main().catch(e => console.error(e));
