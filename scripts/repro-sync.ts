// MOCKING THE LOGIC FROM kanban-board.tsx
// Removed import to avoid TS path issues in standalone run

interface Order {
    id: number;
    status: string;
    updatedAt: string;
}
function mergeOrders(currentOrders: any[], latestOrders: any[], interactionLocks: Record<number, number>) {
    let hasChanges = false

    const mergedOrders = latestOrders.map((serverOrder: any) => {
        const localOrder = currentOrders.find(o => o.id === serverOrder.id)

        // 1. Interaction Lock Check (Grace period of 15 seconds)
        if (interactionLocks[serverOrder.id] && Date.now() - interactionLocks[serverOrder.id] < 15000) {
            console.log(`[LOCKED] Order ${serverOrder.id} is locked. Keeping local.`);
            return localOrder || serverOrder
        }

        // 2. STATUS PRIORITY CHECK (Crucial for Desktop Sync)
        // If status changed on server, we accept it regardless of timestamp unless locked.
        if (localOrder && localOrder.status !== serverOrder.status) {
            console.log(`[STATUS CHANGE] Order ${serverOrder.id} status changed ${localOrder.status} -> ${serverOrder.status}. ACCEPTING.`);
            hasChanges = true
            return serverOrder
        }

        // 3. Timestamp Check (For non-status fields)
        if (localOrder && new Date(localOrder.updatedAt).getTime() > new Date(serverOrder.updatedAt).getTime()) {
            console.log(`[STALE SERVER] Order ${serverOrder.id} local time > server time. Keeping local.`);
            return localOrder
        }

        // Check if this specific order changed from what we have
        if (!localOrder ||
            localOrder.status !== serverOrder.status ||
            localOrder.updatedAt !== serverOrder.updatedAt) {
            hasChanges = true
        }

        return serverOrder
    })

    return { mergedOrders, hasChanges }
}

async function runTest() {
    const now = new Date();
    const past = new Date(now.getTime() - 10000); // 10s ago

    const localState = [{
        id: 109,
        customer: "Munire Macit",
        status: "pending", // Bekliyor
        updatedAt: past.toISOString()
    }];

    const serverState = [{
        id: 109,
        customer: "Munire Macit",
        status: "ready", // Hazır (Mobile moved it)
        updatedAt: new Date().toISOString() // Now
    }];

    console.log("--- TEST 1: Normal Sync (No Locks) ---");
    const res1 = mergeOrders(localState, serverState, {});
    console.log("Result:", res1.mergedOrders[0].status); // Should be 'ready'

    console.log("\n--- TEST 2: Locked (User dragging) ---");
    const locks = { 109: Date.now() }; // Locked NOW
    const res2 = mergeOrders(localState, serverState, locks);
    console.log("Result:", res2.mergedOrders[0].status); // Should be 'pending' (Blocked)

    console.log("\n--- TEST 3: Stale Server Timestamp (Clock Skew) ---");
    // Server says it updated, but its clock is behind local?
    // Or local was optimistically updated with future time?
    const futureLocal = [{ ...localState[0], updatedAt: new Date(now.getTime() + 5000).toISOString() }];
    const res3 = mergeOrders(futureLocal, serverState, {});
    // Even if local time is future, STATUS PRIORITY should override it because status differs?
    console.log("Result:", res3.mergedOrders[0].status); // Should be 'ready' ideally, IF status check is before timestamp check.
}

runTest();
