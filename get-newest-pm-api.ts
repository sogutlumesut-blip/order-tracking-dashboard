async function run() {
    const pm_url = "https://printmarkt.co";
    const pm_key = "pm_c2ce66abab514218a18e2ef437bffcbc";
    let fetchUrl = `${pm_url}/api/orders?_t=${Date.now()}`;
    
    try {
        const res = await fetch(fetchUrl, { headers: { "X-API-Key": pm_key } });
        const data = await res.json();
        const apiOrders = Array.isArray(data) ? data : (data.orders || []);
        
        console.log(`Total API orders returned: ${apiOrders.length}`);
        console.log("Top 10 API orders:");
        apiOrders.slice(0, 10).forEach((o: any) => {
            console.log(`- ID: ${o.id} | Dealer: ${o.dealer_name || o.user_full_name} | Recipient: ${o.recipient_name} | Status: ${o.status} | CreatedAt: ${o.created_at}`);
        });
    } catch (e: any) {
        console.log("Error:", e.message);
    }
}
run();
