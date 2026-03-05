import { db } from "../lib/prisma";

async function run() {
    const settings = await db.systemSetting.findMany();
    const dhlUser = settings.find(s => s.key === 'dhl_user')?.value;
    const dhlPass = settings.find(s => s.key === 'dhl_pass')?.value;

    if (!dhlUser || !dhlPass) {
        console.error("Missing credentials");
        return;
    }

    const soapUrl = "https://service.mngkargo.com.tr/musterikargosiparis/musterikargosiparis.asmx";

    const referansNo = "107706";

    // 1. Check if the order was created in MNG by fetching the barcode
    const barkodXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <MNGGonderiBarkod xmlns="http://tempuri.org/">
      <req>
        <WsUserName>${dhlUser}</WsUserName>
        <WsPassword>${dhlPass}</WsPassword>
        <ReferansNo>${referansNo}</ReferansNo>
        <OutBarkodType>PDF</OutBarkodType>
        <HatadaReferansBarkoduBas>1</HatadaReferansBarkoduBas>
      </req>
    </MNGGonderiBarkod>
  </soap:Body>
</soap:Envelope>`;

    console.log("Sending MNGGonderiBarkod request...");
    const barkodRes = await fetch(soapUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://tempuri.org/MNGGonderiBarkod" },
        body: barkodXml
    });

    const barkodText = await barkodRes.text();
    console.log("Response:", barkodText);
}

run().catch(console.error);
