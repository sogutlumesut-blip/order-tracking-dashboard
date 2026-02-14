
// import fetch from 'node-fetch';

async function checkPrintUrl() {
    const kargoId = 1010769; // Known valid ID
    const url = `https://app.kargoentegrator.com/print/shipment/${kargoId}`;
    console.log(`Checking ${url} WITHOUT Auth...`);

    const res = await fetch(url);
    console.log(`Status: ${res.status} ${res.statusText}`);

    // Check if it redirects to login
    if (res.redirected) {
        console.log(`Redirected to: ${res.url}`);
    }

    // Check content length or title to see if it's a real page or login page
    const text = await res.text();
    console.log(`Content length: ${text.length}`);
    if (text.includes('<title>')) {
        const title = text.match(/<title>(.*?)<\/title>/)?.[1];
        console.log(`Page Title: ${title}`);
    }
}

checkPrintUrl();
