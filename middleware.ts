import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from './lib/auth'

export async function middleware(request: NextRequest) {
    // 1. Update session expiry
    const res = await updateSession(request) || NextResponse.next()

    // 2. Protect routes
    const currentUser = request.cookies.get('session')?.value

    if (!currentUser && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/debug-login') && !request.nextUrl.pathname.startsWith('/register')) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    return res
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
