import { createDHLShipmentAction } from './app/actions'
async function run() {
  console.log("Starting createDHLShipmentAction for 1156...")
  const res = await createDHLShipmentAction(1156, true)
  console.log("Result:", JSON.stringify(res, null, 2))
}
run()
