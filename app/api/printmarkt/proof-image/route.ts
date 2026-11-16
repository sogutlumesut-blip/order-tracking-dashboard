import { NextRequest, NextResponse } from "next/server";
import { getSystemSettings } from "@/app/actions";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        const kind = searchParams.get("kind") || "auto"; // "auto" | "response" | "source"
        const preview = searchParams.get("preview") || "thumb"; // "thumb" | "detail" | "full"

        if (!id) {
            return new NextResponse("Missing id", { status: 400 });
        }

        const settings = (await getSystemSettings()) as Record<string, string>;
        const pmUrl = settings["pm_url"]?.trim().replace(/\/+$/, "");
        const pmKey = settings["pm_key"]?.trim();

        if (!pmUrl || !pmKey) {
            return new NextResponse("PrintMarkt settings missing", { status: 500 });
        }

        const kindsToTry = kind === "auto" ? ["response", "source"] : [kind];

        for (const k of kindsToTry) {
            try {
                const previewQuery = preview === "full" ? "" : `?preview=${preview}`;
                const fetchUrl = `${pmUrl}/api/proof-requests/${id}/files/${k}${previewQuery}`;
                
                const res = await fetch(fetchUrl, {
                    headers: { "X-API-Key": pmKey },
                    signal: AbortSignal.timeout(12000),
                    cache: 'no-store'
                });

                if (res.ok) {
                    const contentType = res.headers.get("content-type") || "image/webp";
                    const arrayBuffer = await res.arrayBuffer();
                    return new NextResponse(Buffer.from(arrayBuffer), {
                        headers: {
                            "Content-Type": contentType,
                            "Cache-Control": "public, max-age=3600, s-maxage=3600"
                        }
                    });
                }
            } catch (err) {
                console.error(`[PROOF_IMAGE] Error fetching ${k} for proof #${id}:`, err);
            }
        }

        return new NextResponse("Image not found", { status: 404 });
    } catch (e: any) {
        console.error("[PROOF_IMAGE] General error:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
