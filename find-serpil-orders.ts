import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    const settings = await db.systemSetting.findMany();
    const pmUrl = settings.find(s => s.key === 'pm_url')?.value;
    const pmKey = settings.find(s => s.key === 'pm_key')?.value;

    if (!pmUrl || !pmKey) {
        console.error("PrintMarkt credentials missing!");
        return;
    }

    const cleanUrl = pmUrl.replace(/\/+$/, '');
    const fetchUrl = `${cleanUrl}/api/orders?limit=250&_t=${Date.now()}`;
    console.log("Fetching from API:", fetchUrl);
    const res = await fetch(fetchUrl, {
        headers: { "X-API-Key": pmKey }
    });

    if (!res.ok) {
        console.error("Fetch failed:", res.status);
        return;
    }

    const pmOrders = await res.json();
    const list = Array.isArray(pmOrders) ? pmOrders : (pmOrders.orders || []);
    console.log(`Fetched ${list.length} orders from API.`);

    const targetIds = ['2516', '2424', '2485'];
    const matches = list.filter((o: any) => {
        const idMatch = (o.id && targetIds.includes(o.id.toString())) ||
                        (o.external_id && (o.external_id.toString().includes('1784070978639') || 
                                           o.external_id.toString().includes('4114163505') || 
                                           o.external_id.toString().includes('1784026858680')));
        const nameMatch = (o.dealer_name && (o.dealer_name.toLowerCase().includes('serpil') || 
                                             o.dealer_name.toLowerCase().includes('balci') || 
                                             o.dealer_name.toLowerCase().includes('leticia'))) ||
                          (o.user_full_name && (o.user_full_name.toLowerCase().includes('serpil') || 
                                                o.user_full_name.toLowerCase().includes('balci') || 
                                                o.user_full_name.toLowerCase().includes('leticia')));
        return idMatch || nameMatch;
    });

    console.log(`\nFound ${matches.length} matching orders in API response:`);
    for (const m of matches) {
        console.log(JSON.stringify({
            id: m.id,
            external_id: m.external_id,
            status: m.status,
            source: m.source,
            recipient_name: m.recipient_name,
            dealer_name: m.dealer_name,
            amount: m.amount,
            payment_status: m.payment_status,
            payment_method: m.payment_method,
            gateway: m.gateway,
            created_at: m.created_at
        }, null, 2));
    }

    // Check in local database
    const dbOrders = await db.order.findMany({
        where: {
            OR: [
                { externalId: { in: ['pm_2516', 'pm_2424', 'pm_2485'] } },
                { customer: { contains: 'Serpil', mode: 'insensitive' } },
                { customer: { contains: 'Balcı', mode: 'insensitive' } },
                { customer: { contains: 'Balci', mode: 'insensitive' } },
                { customer: { contains: 'Leticia', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`\nFound ${dbOrders.length} matching orders in local DB:`);
    for (const o of dbOrders) {
        console.log(`ID: ${o.id} | ExternalID: ${o.externalId} | Customer: ${o.customer.replace(/\n/g, ' ')} | Status: ${o.status}`);
    }
}

run().catch(console.error).finally(() => db.$disconnect());
