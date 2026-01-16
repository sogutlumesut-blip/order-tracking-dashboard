"use client"

import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"

export function SubmitButton() {
    const { pending } = useFormStatus()

    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white p-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
            {pending ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Giriş Yapılıyor...</span>
                </>
            ) : (
                "Giriş Yap"
            )}
        </button>
    )
}
