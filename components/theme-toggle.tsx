"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
    const { setTheme, theme, resolvedTheme } = useTheme()

    return (
        <button
            onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"
            title={resolvedTheme === "light" ? "Karanlık moda geç" : "Aydınlık moda geç"}
        >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" style={{ marginTop: "-1.2rem" }} />
            <span className="sr-only">Tema değiştir</span>
        </button>
    )
}
