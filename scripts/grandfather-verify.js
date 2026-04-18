import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, '../service-account.json'), 'utf8'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();
const listResult = await auth.listUsers(1000);
console.log(`Found ${listResult.users.length} users. Grandfathering all as verified...`);

for (const user of listResult.users) {
  if (user.emailVerified) {
    console.log(`  ✓ ${user.email} — already verified, skipping`);
    continue;
  }
  await auth.updateUser(user.uid, { emailVerified: true });
  console.log(`  ✓ ${user.email} — marked as verified`);
}

console.log('Done.');
process.exit(0);
