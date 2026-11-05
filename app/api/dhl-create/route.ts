import { NextRequest, NextResponse } from "next/server";
import { generateDHLShipment } from "@/lib/cargo-service";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { parseTurkishCityAndDistrict } from "@/lib/turkish-cities";

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Oturum kapalı" }, { status: 401 });
        }

        const body = await req.json();
        const { orderId, city, address, customer, phone } = body;

        if (!orderId) {
            return NextResponse.json({ error: "Geçersiz sipariş ID" }, { status: 400 });
        }

        // If updated address details were provided, safely update DB before shipment creation
        if (city || address || customer || phone) {
            const updatePayload: any = { updatedAt: new Date() };
            if (address) updatePayload.address = address;
            if (customer) updatePayload.customer = customer;
            if (phone) updatePayload.phone = phone;

            if (city) {
                const parsedLoc = parseTurkishCityAndDistrict(city, address);
                updatePayload.city = parsedLoc.formattedCity;
            }

            await db.order.update({
                where: { id: orderId },
                data: updatePayload
            }).catch(err => {
                console.warn("[DHL_CREATE_PRE_UPDATE_ERR]", err);
            });
        }

        const res = await generateDHLShipment(orderId, session.user.name, false);
        return NextResponse.json(res);
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Bilinmeyen bir hata oluştu" }, { status: 500 });
    }
}
