// Creates a staff login. Usage:
//   npm run staff:create -- owner@example.com "Owner Name" owner
// The password is read from the STAFF_PASSWORD environment variable so it never lands in shell history.
import { createStaff } from '../lib/auth';
import { sql } from '../lib/db';

const [email, name, role = 'staff'] = process.argv.slice(2);
const password = process.env.STAFF_PASSWORD ?? '';
if (!email || !name || !['owner', 'staff'].includes(role)) {
  console.error('usage: STAFF_PASSWORD=... npm run staff:create -- <email> "<name>" [owner|staff]');
  process.exit(1);
}
try {
  const id = await createStaff(email, name, password, role as 'owner' | 'staff');
  console.log(`created ${role} ${email} (id ${id})`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
