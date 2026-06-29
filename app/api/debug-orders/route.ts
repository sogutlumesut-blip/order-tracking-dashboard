import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';
import { getOrders } from '@/app/actions';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const allOrders = await getOrders();
        const found = allOrders.find((o: any) => o.externalId === 'pm_2100');
        
        return NextResponse.json({
            success: true,
            total_returned_by_getOrders: allOrders.length,
            pm_2100_in_getOrders: found ? {
                id: found.id,
                customer: found.customer,
                status: found.status,
                date: found.date
            } : null,
            last_5_in_getOrders: allOrders.slice(0, 5).map((o: any) => ({
                id: o.id,
                externalId: o.externalId,
                customer: o.customer,
                status: o.status,
                date: o.date
            }))
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
