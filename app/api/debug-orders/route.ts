import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';
import { syncPrintMarktOrders } from '@/app/actions';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log("RUNNING SYNC FROM DEBUG ENDPOINT...");
        const res = await syncPrintMarktOrders(true);
        
        // Let's check if the orders are now in the DB
        const orders = await db.order.findMany({
            where: {
                externalId: {
                    in: ['pm_2124', 'pm_2123']
                }
            },
            select: {
                id: true,
                externalId: true,
                customer: true,
                status: true,
                createdAt: true
            }
        });
        
        return NextResponse.json({
            success: true,
            syncResult: res,
            ordersInDbAfterSync: orders
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
