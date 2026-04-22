import { db } from "./lib/prisma";

async function run() {
    const order = await db.order.findUnique({ where: { id: 1339 } });
    console.log("Address:", order.address);
    console.log("City:", order.city);
    
    let il = "ISTANBUL";
    let ilce = "SISLI";
    const addressMatch = (order.address || "").match(/\b([A-ZŞİĞÜÇÖa-zşıiğüçö]+)\s*\/\s*([A-ZŞİĞÜÇÖa-zşıiğüçö]+)\b/);
    if (addressMatch) {
        ilce = addressMatch[1].trim().toUpperCase();
        il = addressMatch[2].trim().toUpperCase();
    } else if (order.city) {
        il = order.city.trim().toUpperCase();
        ilce = order.city.trim().toUpperCase();
    }
    console.log("Resolved ilce:", ilce, "il:", il);
}
run();
