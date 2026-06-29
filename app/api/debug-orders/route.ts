import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const where: any = {};
        const allOrders = await db.order.findMany({
            where,
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
        
        const found = allOrders.find((o: any) => o.externalId === 'pm_2100');
        
        return NextResponse.json({
            success: true,
            total_returned_for_admin: allOrders.length,
            pm_2100_in_admin_list: found ? {
                id: found.id,
                customer: found.customer,
                status: found.status,
                date: found.date
            } : null,
            last_5_in_admin_list: allOrders.slice(0, 5).map((o: any) => ({
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
