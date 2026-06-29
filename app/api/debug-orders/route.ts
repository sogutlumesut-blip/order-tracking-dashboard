import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const allOrders = await db.order.findMany({
            orderBy: { date: "desc" },
            take: 500,
            select: {
                id: true,
                externalId: true,
                customer: true,
                status: true,
                date: true
            }
        });
        
        const counts = allOrders.reduce((acc: any, curr: any) => {
            acc[curr.status] = (acc[curr.status] || 0) + 1;
            return acc;
        }, {});
        
        const pm2100 = allOrders.find((o: any) => o.externalId === 'pm_2100');
        
        // Find position of pm_2100 in the sorted list
        const pm2100Index = allOrders.findIndex((o: any) => o.externalId === 'pm_2100');
        
        return NextResponse.json({
            success: true,
            total_orders_returned: allOrders.length,
            status_counts_in_top_500: counts,
            pm_2100_index: pm2100Index,
            pm_2100_details: pm2100 ? {
                id: pm2100.id,
                customer: pm2100.customer,
                status: pm2100.status,
                date: pm2100.date
            } : null
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
