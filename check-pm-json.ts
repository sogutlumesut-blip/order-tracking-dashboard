import * as fs from 'fs';

const orders = JSON.parse(fs.readFileSync('pm-orders.json', 'utf8'));
console.log("Total orders in JSON:", orders.length);
orders.slice(0, 10).forEach((o: any) => {
    console.log(`ID: ${o.id} | ExternalID: ${o.external_id} | CreatedAt: ${o.created_at} | Name: ${o.recipient_name} | Dealer: ${o.dealer_name} | User: ${o.user_full_name} | Status: ${o.status}`);
});
