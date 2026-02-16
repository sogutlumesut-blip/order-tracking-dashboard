
const BASE_URL = "http://localhost:3000"; // Or production URL if testing live
// Since we are in local dev, we can't easily hit localhost:3000 from here unless running.
// But we can invoke the DB logic directly or try fetch if next dev is running.
// Actually, safely assume we just check the file content or run a small mock.
// I will write a script that imports the logic, or connects to DB and runs the query to SEE what would be updated.

import { db } from "../lib/prisma";

async function checkCandidates() {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    console.log(`Checking for orders shipped before ${threeDaysAgo.toISOString()}...`);

    const orders = await db.order.findMany({
        where: {
            status: 'shipped',
            updatedAt: {
                lt: threeDaysAgo
            }
        }
    });

    console.log(`Found ${orders.length} candidates for auto-completion.`);
    orders.forEach(o => {
        console.log(`- Order #${o.id} (${o.customer}) - Updated: ${o.updatedAt}`);
    });
}

checkCandidates();
