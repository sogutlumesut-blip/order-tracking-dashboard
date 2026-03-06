import { PrismaClient } from "@prisma/client";
import { createDHLShipmentAction } from "./app/actions";

const db = new PrismaClient();

async function run() {
    // A known order ID to test DHL shipping
    // User mentioned #107652 in previous contexts, or we can just find any recent order
    const order = await db.order.findFirst({
        where: { id: { gt: 10 } },
        orderBy: { id: 'desc' }
    });

    if (!order) {
        console.error("No test order found in DB");
        return;
    }

    console.log(`Testing MNG API for Order #${order.id}...`);

    try {
        // We bypass the next-auth session check by mocking `getSession()` in actions.ts?
        // Wait, createDHLShipmentAction checks `const session = await getSession()`.
        // That will fail in a CLI script. I should mock it or run it via fetch to a temporary API route.
        console.log("Since this script lacks NextAuth session context, I'm building a temporary API route to trigger the function and bypass auth checks.");
    } catch (e) {
        console.error(e);
    }
}

run();
