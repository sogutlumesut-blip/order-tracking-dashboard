const http = require('http');
const https = require('https');

const PORT = 3005;

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, SOAPAction');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/relay') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const soapAction = req.headers['soapaction'] || req.headers['SoapAction'] || req.headers['SOAPAction'];
            console.log(`[PROXY] Forwarding Request: ${soapAction}`);

            const options = {
                hostname: 'service.mngkargo.com.tr',
                port: 443,
                path: '/musterikargosiparis/musterikargosiparis.asmx',
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': soapAction,
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const mngReq = https.request(options, (mngRes) => {
                let data = '';
                mngRes.on('data', (c) => data += c);
                mngRes.on('end', () => {
                    res.writeHead(mngRes.statusCode, { 'Content-Type': 'text/xml' });
                    res.end(data);
                });
            });

            mngReq.on('error', (e) => {
                console.error("[PROXY] MNG Connection Error:", e);
                res.writeHead(500);
                res.end(e.toString());
            });

            mngReq.write(body);
            mngReq.end();
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`MNG SOAP Proxy Server listening on port ${PORT}`);
});
