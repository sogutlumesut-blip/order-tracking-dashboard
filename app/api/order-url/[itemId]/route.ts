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
      select: { url: true }
    });

    if (!item || !item.url || !item.url.startsWith('data:')) {
      return new NextResponse("Not Found or Not Base64", { status: 404 });
    }

    // Extract base64 and mime type
    const match = item.url.match(/^data:([a-zA-Z0-9-]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
    if (!match) {
        return new NextResponse("Invalid Base64 Format", { status: 400 });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `attachment; filename="order-file-${itemId}.${mimeType.split('/')[1] || 'pdf'}"`
      },
    });
  } catch (error) {
    console.error("Error fetching file:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
