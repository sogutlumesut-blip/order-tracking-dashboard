"use client"

import { useState } from "react"

export function SimpleAddUser() {
    const [count, setCount] = useState(0)

    return (
        <button
            onClick={() => {
                alert("Buton Çalışıyor!")
                setCount(c => c + 1)
            }}
            className="bg-red-600 text-white font-bold px-4 py-2 rounded shadow hover:bg-red-700 transition-colors"
        >
            TEST BUTONU ({count})
        </button>
    )
}
