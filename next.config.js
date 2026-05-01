/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    serverExternalPackages: [],
    experimental: {
        serverActions: {
            bodySizeLimit: '20mb',
        },
    },
    typescript: {
        ignoreBuildErrors: true,
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
