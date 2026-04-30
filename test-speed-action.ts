import { createDHLShipmentAction } from './app/actions';
async function test() {
    console.time("Action");
    const res = await createDHLShipmentAction(1834, true); // bypassAuth=true
    console.timeEnd("Action");
    console.log(res);
}
test();
