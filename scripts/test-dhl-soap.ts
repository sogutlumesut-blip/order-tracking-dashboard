import { db } from "../lib/prisma";

async function testSoap() {
    const settings = await db.systemSetting.findMany();
    const dhlUser = settings.find(s => s.key === 'dhl_user')?.value;
    const dhlPass = settings.find(s => s.key === 'dhl_pass')?.value;
    const dhlCust = settings.find(s => s.key === 'dhl_customer_id')?.value;

    console.log("Using credentials:", { dhlUser, dhlPass: "***", dhlCust });

    if (!dhlUser || !dhlPass) {
        console.error("Missing DHL credentials in DB.");
        return;
    }

    const urls = [
        "https://onlinesube.dhlecommerce.com.tr/musterihizmetleri.asmx",
        "https://onlinesube.dhlecommerce.com.tr/SiparisGirisi.asmx",
        "https://service.mngkargo.com.tr/ts/MusteriKargoSiparis.asmx"
    ];

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SiparisGirisiDetayliV3 xmlns="http://tempuri.org/">
      <pKullaniciAdi>${dhlUser}</pKullaniciAdi>
      <pSifre>${dhlPass}</pSifre>
      <pKargoBilgiArray>
        <pMusteriSiparisNo>TEST_123</pMusteriSiparisNo>
        <pAliciMusteriAdi>Test User</pAliciMusteriAdi>
        <pAliciAdres>Test Adresi Istanbul</pAliciAdres>
        <pAliciTel1>05551112233</pAliciTel1>
        <pSehirAdi>ISTANBUL</pSehirAdi>
        <pIlceAdi>SISLI</pIlceAdi>
        <pBarcod>TEST123BAR</pBarcod>
        <pIcerik>Duvarkagidi</pIcerik>
        <pGonderiHizmetSekli>NORMAL</pGonderiHizmetSekli>
        <pTeslimSekli>ADRESE_TESLIM</pTeslimSekli>
        <pFlAlSms>0</pFlAlSms>
        <pFlGnSms>0</pFlGnSms>
        <pLuOdemeSekli>GONDERICI_ODER</pLuOdemeSekli>
        <pFlAdresFarkli>0</pFlAdresFarkli>
      </pKargoBilgiArray>
    </SiparisGirisiDetayliV3>
  </soap:Body>
</soap:Envelope>`;

    for (const url of urls) {
        console.log("\n--- Testing URL:", url, "---");
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "text/xml; charset=utf-8",
                    "SOAPAction": "http://tempuri.org/SiparisGirisiDetayliV3"
                },
                body: soapBody
            });

            console.log("Status:", response.status);
            const text = await response.text();
            console.log("Response (first 200 chars):", text.substring(0, 200));
            if (text.includes("SiparisGirisiDetayliV3Result")) {
                console.log("SUCCESS! Found result tag.");
            }
        } catch (e: any) {
            console.error("Error for URL:", url, e.message);
        }
    }
}

testSoap();

testSoap();
