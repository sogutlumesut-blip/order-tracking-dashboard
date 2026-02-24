
import { updateOrderStatus } from '../app/actions'

async function main() {
    console.log("Simulating updateOrderStatus call...")
    try {
        // Trying to move order #236 to 'Awaiting Approval' (as in the screenshot)
        const result = await updateOrderStatus(236, 'Awaiting Approval')
        console.log("Action Result:", result)
    } catch (e) {
        console.error("Action FAILED:", e)
    }
}

main()
