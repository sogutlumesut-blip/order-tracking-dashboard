export const COLOR_MAP: Record<string, { bg: string, text: string, border: string }> = {
    // Grays
    gray: { bg: 'bg-gray-100', text: 'text-gray-900', border: 'border-gray-200' },
    white: { bg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200' },

    // Blues
    blue: { bg: 'bg-blue-100', text: 'text-gray-900', border: 'border-blue-200' },
    cyan: { bg: 'bg-cyan-100', text: 'text-gray-900', border: 'border-cyan-200' },
    sky: { bg: 'bg-sky-100', text: 'text-gray-900', border: 'border-sky-200' },

    // Greens
    green: { bg: 'bg-green-100', text: 'text-gray-900', border: 'border-green-200' },
    emerald: { bg: 'bg-emerald-100', text: 'text-gray-900', border: 'border-emerald-200' },
    teal: { bg: 'bg-teal-100', text: 'text-gray-900', border: 'border-teal-200' },

    // Warm
    red: { bg: 'bg-red-100', text: 'text-gray-900', border: 'border-red-200' },
    orange: { bg: 'bg-orange-100', text: 'text-gray-900', border: 'border-orange-200' },
    amber: { bg: 'bg-amber-100', text: 'text-gray-900', border: 'border-amber-200' },
    yellow: { bg: 'bg-yellow-100', text: 'text-gray-900', border: 'border-yellow-200' },

    // Purples/Pinks
    purple: { bg: 'bg-purple-100', text: 'text-gray-900', border: 'border-purple-200' },
    violet: { bg: 'bg-violet-100', text: 'text-gray-900', border: 'border-violet-200' },
    pink: { bg: 'bg-pink-100', text: 'text-gray-900', border: 'border-pink-200' },
    rose: { bg: 'bg-rose-100', text: 'text-gray-900', border: 'border-rose-200' },
}

export function getColorClasses(colorKey: string | null | undefined) {
    if (!colorKey || !COLOR_MAP[colorKey]) {
        // Fallback for unknown colors or empty
        return COLOR_MAP['gray']
    }
    return COLOR_MAP[colorKey]
}
