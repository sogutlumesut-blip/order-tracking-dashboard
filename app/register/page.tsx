"use client"

import { registerAction } from "./actions"
import { useFormStatus } from "react-dom"
import { useState } from "react"
import { toast } from "sonner"
import Link from "next/link"

// Submit Button Component
function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="group relative flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 transition-all"
        >
            {pending && (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            {pending ? "Kayıt Yapılıyor..." : "Kayıt Ol"}
        </button>
    )
}

import { useRouter } from "next/navigation"

// ... imports ...

export default function RegisterPage() {
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    async function handleSubmit(formData: FormData) {
        try {
            const result = await registerAction(formData)
            if (result?.error) {
                setError(result.error)
                toast.error(result.error)
            } else if (result?.success) {
                toast.success("Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...")
                router.push("/login?registered=true")
            }
        } catch (e) {
            toast.error("Bir hata oluştu. Lütfen tekrar deneyin.")
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
            <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-10 shadow-2xl">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
                        Ekibe Katıl
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Siparişlerinizi takip etmek için kayıt olun.
                    </p>
                </div>

                <form action={handleSubmit} className="mt-8 space-y-6">
                    <div className="-space-y-px rounded-md shadow-sm">
                        {error && (
                            <div className="p-3 bg-red-100 text-red-700 text-sm rounded mb-4">
                                {error}
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700">Şirket Kodu</label>
                            <input
                                name="code"
                                type="text"
                                required
                                placeholder="Örn: DKM2025"
                                className="relative block w-full rounded-md border-0 py-1.5 p-2 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                            />
                            <p className="text-xs text-gray-500 mt-1">* Bu kodu yöneticinizden almalısınız.</p>
                        </div>

                        <div className="my-2">
                            <label className="block text-sm font-medium text-gray-700">Ad Soyad</label>
                            <input
                                name="name"
                                type="text"
                                required
                                placeholder="Ahmet Yılmaz"
                                className="relative block w-full rounded-md border-0 py-1.5 p-2 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                            />
                        </div>

                        <div className="my-2">
                            <label className="block text-sm font-medium text-gray-700">Kullanıcı Adı</label>
                            <input
                                name="username"
                                type="text"
                                required
                                className="relative block w-full rounded-md border-0 py-1.5 p-2 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                            />
                        </div>

                        <div className="my-2">
                            <label className="block text-sm font-medium text-gray-700">Şifre</label>
                            <input
                                name="password"
                                type="password"
                                required
                                className="relative block w-full rounded-md border-0 py-1.5 p-2 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                            />
                        </div>
                    </div>

                    <div>
                        <SubmitButton />
                    </div>
                    <div className="text-center text-sm">
                        <Link href="/login" className="text-blue-600 hover:underline">
                            Zaten hesabınız var mı? Giriş Yap
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    )
}
