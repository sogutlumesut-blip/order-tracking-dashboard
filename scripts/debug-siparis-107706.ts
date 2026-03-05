import { db } from "../lib/prisma";

async function run() {
    const settings = await db.systemSetting.findMany();
    const dhlUser = settings.find(s => s.key === 'dhl_user')?.value;
    const dhlPass = settings.find(s => s.key === 'dhl_pass')?.value;

    if (!dhlUser || !dhlPass) return console.error("Missing credentials");

    const order = await db.order.findUnique({ where: { id: 107706 } });
    const soapUrl = "https://service.mngkargo.com.tr/musterikargosiparis/musterikargosiparis.asmx";

    let il = "ISTANBUL";
    let ilce = "SISLI";
    let phone = (order?.phone || "05551112233").replace(/[^0-9]/g, "");

    const siparisGirisiXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SiparisGirisiDetayliV3 xmlns="http://tempuri.org/">
      <pChIrsaliyeNo>${order?.id}</pChIrsaliyeNo>
      <pPrKiymet></pPrKiymet>
      <pChBarkod>${order?.id}</pChBarkod>
      <pChIcerik>Duvarkagidi</pChIcerik>
      <pGonderiHizmetSekli>NORMAL</pGonderiHizmetSekli>
      <pTeslimSekli>1</pTeslimSekli>
      <pFlAlSms>0</pFlAlSms>
      <pFlGnSms>0</pFlGnSms>
      <pKargoParcaList>1:1:1:1:1:;</pKargoParcaList>
      <pAliciMusteriMngNo></pAliciMusteriMngNo>
      <pAliciMusteriBayiNo></pAliciMusteriBayiNo>
      <pAliciMusteriAdi><![CDATA[${(order?.customer || "Musteri").substring(0, 50)}]]></pAliciMusteriAdi>
      <pChSiparisNo>${order?.id}</pChSiparisNo>
      <pLuOdemeSekli>P</pLuOdemeSekli>
      <pFlAdresFarkli>0</pFlAdresFarkli>
      <pChIl>${il}</pChIl>
      <pChIlce>${ilce}</pChIlce>
      <pChAdres><![CDATA[${(order?.address || "Adres Belirtilmemis").substring(0, 200)}]]></pChAdres>
      <pChSemt></pChSemt>
      <pChMahalle></pChMahalle>
      <pChMeydanBulvar></pChMeydanBulvar>
      <pChCadde></pChCadde>
      <pChSokak></pChSokak>
      <pChTelEv></pChTelEv>
      <pChTelCep>${phone}</pChTelCep>
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

    const siparisRes = await fetch(soapUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://tempuri.org/SiparisGirisiDetayliV3" },
        body: siparisGirisiXml
    });
    console.log("Siparis Res:", await siparisRes.text());

    // NOW TEST BARCODE FETCH
    const barkodXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <MNGGonderiBarkod xmlns="http://tempuri.org/">
      <req>
        <WsUserName>${dhlUser}</WsUserName>
        <WsPassword>${dhlPass}</WsPassword>
        <ReferansNo>${order?.id}</ReferansNo>
        <OutBarkodType>PDF</OutBarkodType>
        <HatadaReferansBarkoduBas>1</HatadaReferansBarkoduBas>
      </req>
    </MNGGonderiBarkod>
  </soap:Body>
</soap:Envelope>`;

    const barkodRes = await fetch(soapUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://tempuri.org/MNGGonderiBarkod" },
        body: barkodXml
    });
    console.log("Barkod Res:", await barkodRes.text());
}

run().catch(console.error);
