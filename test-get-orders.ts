import { getOrders } from './app/actions';
async function test() {
  try {
    const orders = await getOrders();
    console.log("Success! Orders count:", orders.length);
  } catch(e) {
    console.error("Crash:", e);
  }
}
test();
