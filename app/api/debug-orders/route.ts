import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const settings = await db.systemSetting.findMany();
        const settingsMap: Record<string, string> = {};
        settings.forEach(s => {
            let val = s.value;
            if (s.key.includes('key') || s.key.includes('token') || s.key.includes('secret')) {
                val = val ? `${val.substring(0, 4)}...${val.substring(val.length - 4)} (len: ${val.length})` : 'null';
            }
            settingsMap[s.key] = val || 'null';
        });
        
        return NextResponse.json({
            success: true,
            settings: settingsMap
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
