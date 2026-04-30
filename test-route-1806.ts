import { NextRequest, NextResponse } from 'next/server';

// Mock cookies globally before importing the route
jest.mock('next/headers', () => ({
    cookies: () => ({
        get: () => ({ value: 'mocked_session' })
    })
}));

import { GET } from './app/api/cargo-label/[orderId]/route';

// Simulate NextRequest
const req = new NextRequest('http://localhost:3000/api/cargo-label/1806');

async function test() {
    try {
        const res = await GET(req, { params: Promise.resolve({ orderId: "1806" }) });
        console.log("Status:", res.status);
        if (res.status !== 200) {
            console.log("Error text:", await res.text());
        } else {
            console.log("SUCCESS! Headers:", Object.fromEntries(res.headers.entries()));
        }
    } catch(e) {
        console.error("Crash:", e);
    }
}

test();
