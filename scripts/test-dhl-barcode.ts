import { db } from "../lib/prisma";

async function testBarcode() {
    const settings = await db.systemSetting.findMany();
    const dhlUser = settings.find(s => s.key === 'dhl_user')?.value;
    const dhlPass = settings.find(s => s.key === 'dhl_pass')?.value;

    const url = "https://service.mngkargo.com.tr/musterikargosiparis/musterikargosiparis.asmx";

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <MNGGonderiBarkod xmlns="http://tempuri.org/">
      <req>
        <WsUserName>${dhlUser}</WsUserName>
        <WsPassword>${dhlPass}</WsPassword>
        <ReferansNo>TEST_123</ReferansNo>
        <OutBarkodType>PDF</OutBarkodType>
        <HatadaReferansBarkoduBas>1</HatadaReferansBarkoduBas>
      </req>
    </MNGGonderiBarkod>
  </soap:Body>
</soap:Envelope>`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": "http://tempuri.org/MNGGonderiBarkod"
            },
            body: soapBody
        });

        const text = await response.text();
        console.log("Status:", response.status);
        console.log("Response:", text);
    } catch (e: any) {
        console.error("Error for URL:", url, e.message);
    }
}

testBarcode();
