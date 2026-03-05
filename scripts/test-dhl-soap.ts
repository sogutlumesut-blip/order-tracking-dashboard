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
        "https://service.mngkargo.com.tr/musterikargosiparis/musterikargosiparis.asmx"
    ];

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SiparisGirisiDetayliV3 xmlns="http://tempuri.org/">
      <pChIrsaliyeNo></pChIrsaliyeNo>
      <pPrKiymet></pPrKiymet>
      <pChBarkod>TEST123BAR</pChBarkod>
      <pChIcerik>Duvarkagidi</pChIcerik>
      <pGonderiHizmetSekli>NORMAL</pGonderiHizmetSekli>
      <pTeslimSekli>1</pTeslimSekli>
      <pFlAlSms>0</pFlAlSms>
      <pFlGnSms>0</pFlGnSms>
      <pKargoParcaList>1:1:1:1:1:;</pKargoParcaList>
      <pAliciMusteriMngNo></pAliciMusteriMngNo>
      <pAliciMusteriBayiNo></pAliciMusteriBayiNo>
      <pAliciMusteriAdi>Test User</pAliciMusteriAdi>
      <pChSiparisNo>TEST_123</pChSiparisNo>
      <pLuOdemeSekli>P</pLuOdemeSekli>
      <pFlAdresFarkli>0</pFlAdresFarkli>
      <pChIl>ISTANBUL</pChIl>
      <pChIlce>SISLI</pChIlce>
      <pChAdres>Test Adres</pChAdres>
      <pChSemt></pChSemt>
      <pChMahalle></pChMahalle>
      <pChMeydanBulvar></pChMeydanBulvar>
      <pChCadde></pChCadde>
      <pChSokak></pChSokak>
      <pChTelEv></pChTelEv>
      <pChTelCep>05551112233</pChTelCep>
      <pChTelIs></pChTelIs>
      <pChFax></pChFax>
      <pChEmail></pChEmail>
      <pChVergiDairesi></pChVergiDairesi>
      <pChVergiNumarasi></pChVergiNumarasi>
      <pFlKapidaOdeme>0</pFlKapidaOdeme>
      <pMalBedeliOdemeSekli></pMalBedeliOdemeSekli>
      <pPlatformKisaAdi></pPlatformKisaAdi>
      <pPlatformSatisKodu></pPlatformSatisKodu>
      <pKullaniciAdi>${dhlUser}</pKullaniciAdi>
      <pSifre>${dhlPass}</pSifre>
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
            console.log("Response:", text);
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
