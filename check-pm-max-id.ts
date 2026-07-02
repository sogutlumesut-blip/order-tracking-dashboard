import * as fs from 'fs';

const orders = JSON.parse(fs.readFileSync('pm-orders.json', 'utf8'));
const ids = orders.map((o: any) => Number(o.id)).filter((id: number) => !isNaN(id));
ids.sort((a: number, b: number) => b - a);

console.log("10 largest IDs in pm-orders.json:", ids.slice(0, 10));
