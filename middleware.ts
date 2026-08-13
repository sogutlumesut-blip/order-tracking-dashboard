import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from './lib/auth'

export async function middleware(request: NextRequest) {
    // 0. Detect Health Check requests from DigitalOcean or Go-http-client health check daemons
    const userAgent = request.headers.get('user-agent') || ''
    const isHealthCheck = userAgent.toLowerCase().includes('go-http-client') || userAgent.toLowerCase().includes('digitalocean')
    if (isHealthCheck || request.nextUrl.pathname === '/api/health') {
        return NextResponse.json({ status: 'ok', source: 'healthcheck' })
    }

    // 0. Check Maintenance Mode
    if (process.env.MAINTENANCE_MODE === 'true') {
        if (!request.nextUrl.pathname.startsWith('/maintenance')) {
            return NextResponse.redirect(new URL('/maintenance', request.url))
        }
        return NextResponse.next()
    } else if (request.nextUrl.pathname.startsWith('/maintenance')) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    // 1. Update session expiry
    const res = await updateSession(request) || NextResponse.next()

    // 2. Protect routes
    const currentUser = request.cookies.get('session')?.value

    if (!currentUser &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/debug-login') &&
        !request.nextUrl.pathname.startsWith('/register') &&
        !request.nextUrl.pathname.startsWith('/privacy-policy') &&
        !request.nextUrl.pathname.startsWith('/terms-of-service') &&
        !request.nextUrl.pathname.startsWith('/data-deletion')
    ) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    return res
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
