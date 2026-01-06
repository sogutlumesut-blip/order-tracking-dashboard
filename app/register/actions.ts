"use server"

import { db } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { redirect } from "next/navigation"

const COMPANY_CODE = "DKM2025" // Hardcoded for prototype

export async function registerAction(formData: FormData) {
    const username = formData.get("username") as string
    const password = formData.get("password") as string
    const name = formData.get("name") as string
    const code = formData.get("code") as string

    if (!username || !password || !name || !code) {
        return { error: "Tüm alanları doldurunuz." }
    }

    // if (code !== COMPANY_CODE) {
    //    return { error: "Geçersiz Şirket Kodu! Yöneticinize başvurun." }
    // }

    // Check if user exists
    const existingUser = await db.user.findUnique({
        where: { username }
    })

    if (existingUser) {
        return { error: "Bu kullanıcı adı zaten alınmış." }
    }

    // Create user
    const hashedPassword = await bcrypt.hash(password, 10)
    await db.user.create({
        data: {
            username,
            password: hashedPassword,
            name,
            role: "staff" // Auto-approve for now
        }
    })

    // redirect("/login?registered=true")
    return { success: true }
}
