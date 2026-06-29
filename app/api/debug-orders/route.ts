import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const pmCount = await db.order.count({ where: { source: 'PrintMarkt' } });
        const pendingPmCount = await db.order.count({ where: { status: 'pending_pm' } });
        const lastPmOrders = await db.order.findMany({
            where: { source: 'PrintMarkt' },
            orderBy: { id: 'desc' },
            take: 10,
            select: {
                id: true,
                externalId: true,
                customer: true,
                status: true,
                date: true
            }
        });
        
        return NextResponse.json({
            success: true,
            database_url_truncated: process.env.DATABASE_URL?.split('@')[1] || 'no-db-url',
            total_pm_orders: pmCount,
            total_pending_pm_orders: pendingPmCount,
            last_10_pm_orders: lastPmOrders
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
