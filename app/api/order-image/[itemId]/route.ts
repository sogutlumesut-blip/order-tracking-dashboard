import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ itemId: string }> }
) {
  try {
    const params = await props.params;
    const itemId = parseInt(params.itemId, 10);
    if (isNaN(itemId)) {
      return new NextResponse("Invalid ID", { status: 400 });
    }

    const item = await db.orderItem.findUnique({
      where: { id: itemId },
      select: { id: true, orderId: true, image_src: true }
    });

    if (!item || !item.image_src) {
      return new NextResponse("Not Found", { status: 404 });
    }

    let rawSrc = item.image_src;

    // Resolve chained references or legacy /api/order-image/ links
    let hops = 0;
    while (rawSrc && rawSrc.includes('/api/order-image/') && !rawSrc.includes('data:image') && hops < 5) {
      hops++;
      const nextMatch = rawSrc.match(/\/api\/order-image\/(\d+)/);
      if (!nextMatch) break;
      const refId = parseInt(nextMatch[1], 10);
      if (refId === itemId) break;
      const refItem = await db.orderItem.findUnique({
        where: { id: refId },
        select: { image_src: true }
      });
      if (refItem?.image_src) {
        rawSrc = refItem.image_src;
      } else {
        // Fallback: check comments of this order for uploaded images
        const comment = await db.comment.findFirst({
          where: { orderId: item.orderId, attachments: { contains: 'data:image' } },
          orderBy: { timestamp: 'desc' }
        });
        if (comment?.attachments) {
          try {
            const atts = JSON.parse(comment.attachments);
            const foundAtt = atts.find((a: any) => a?.url?.startsWith('data:image'));
            if (foundAtt?.url) {
              rawSrc = foundAtt.url;
            }
          } catch (e) {}
        }
        break;
      }
    }

    // Split multiple images if concatenated with '|'
    const indexParam = req.nextUrl.searchParams.get("index");
    const requestedIdx = indexParam ? Math.max(0, parseInt(indexParam, 10) || 0) : 0;
    
    const parts = rawSrc.split('|').map(s => s.trim()).filter(Boolean);
    const dataParts = parts.filter(p => p.includes('data:image'));
    const target = dataParts[requestedIdx] || dataParts[0] || parts[0];

    if (!target) {
      return new NextResponse("Image Not Found", { status: 404 });
    }

    // If target is an external URL, redirect or proxy
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return NextResponse.redirect(target, { status: 307 });
    }

    // Extract base64 without regex backtracking risks
    const commaIndex = target.indexOf(',');
    if (commaIndex === -1) {
      return new NextResponse("Invalid Image Format", { status: 400 });
    }

    const header = target.slice(0, commaIndex);
    const base64Data = target.slice(commaIndex + 1);

    const mimeMatch = header.match(/data:(image\/[a-zA-Z0-9.+_-]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const buffer = Buffer.from(base64Data, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error("Error fetching image:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
