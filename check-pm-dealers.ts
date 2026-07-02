import * as fs from 'fs';

const orders = JSON.parse(fs.readFileSync('pm-orders.json', 'utf8'));
const dealers = new Set(orders.map((o: any) => o.dealer_name || o.user_full_name || 'Unknown'));
console.log("Unique dealers in pm-orders.json:", Array.from(dealers));
