import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export async function GET(request: Request) {
    try {
        const logPath = "/tmp/oms_debug.log";
        if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            const content = fs.readFileSync(logPath, 'utf8');
            // Return only the last 10,000 characters to prevent overflow
            const truncated = content.substring(Math.max(0, content.length - 15000));
            return NextResponse.json({
                success: true,
                exists: true,
                size: stats.size,
                mtime: stats.mtime.toISOString(),
                path: logPath,
                content: truncated
            });
        } else {
            return NextResponse.json({
                success: true,
                exists: false,
                path: logPath,
                message: "Log file does not exist."
            });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
