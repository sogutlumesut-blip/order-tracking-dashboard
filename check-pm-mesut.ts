import * as fs from 'fs';

const orders = JSON.parse(fs.readFileSync('pm-orders.json', 'utf8'));
const mesutOrders = orders.filter((o: any) => {
    const dealer = (o.dealer_name || o.user_full_name || '').toLowerCase();
    return dealer.includes('mesut') && dealer.includes('s');
});

console.log(`Found ${mesutOrders.length} orders for Mesut in pm-orders.json:`);
mesutOrders.slice(0, 20).forEach((o: any) => {
    console.log(`ID: ${o.id} | ExternalID: ${o.external_id} | CreatedAt: ${o.created_at} | Name: ${o.recipient_name} | Dealer: ${o.dealer_name || o.user_full_name} | Status: ${o.status}`);
});
