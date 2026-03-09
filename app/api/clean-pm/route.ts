import { NextResponse } from 'next/server';
import { db } from '@/lib/db'; // Make sure this path is right or use PrismaClient

export async function GET() {
    try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        const deleted = await prisma.order.deleteMany({ where: { source: "PrintMarkt" } });
        return NextResponse.json({ success: true, count: deleted.count });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
