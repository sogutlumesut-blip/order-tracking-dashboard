import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const o = await db.order.findUnique({
            where: { id: 3422 },
            select: {
                id: true,
                externalId: true,
                createdAt: true,
                updatedAt: true
            }
        });
        return NextResponse.json({
            success: true,
            order: o
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
