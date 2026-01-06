/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: '5mb',
        },
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
                pathname: '**',
            },
            {
                protocol: 'https',
                hostname: 'placehold.co',
                pathname: '**',
            },
            {
                protocol: 'https',
                hostname: 'duvarkagidimarketi.com',
                pathname: '**',
            },
            {
                protocol: 'https',
                hostname: 'www.duvarkagidimarketi.com',
                pathname: '**',
            },
        ],
    },
}

module.exports = nextConfig
