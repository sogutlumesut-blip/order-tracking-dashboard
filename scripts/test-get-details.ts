import { getOrderDetails } from '../app/actions'
import { getSession } from '../lib/auth'

// Mock getSession to return a valid session for the test
jest.mock('../lib/auth', () => ({
    getSession: jest.fn().mockResolvedValue({
        user: { id: 'test-user-id', name: 'Test Admin', role: 'admin' }
    })
}));

async function main() {
    try {
        const orderId = 3421;
        console.log(`Calling getOrderDetails(${orderId})...`);
        const result = await getOrderDetails(orderId);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
main();
