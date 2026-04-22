export async function testMng(il: string, ilce: string, adres: string, orderId: number) {
    const soapUrl = "https://duvarkagidimarketi.com/mng-proxy.php";
    const dhlUser = "3494424265";
    const dhlPass = "Dkm32373**";
    const pKargoParcaList = "1:1:15:15:100:;";

    const siparisGirisiXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SiparisGirisiDetayliV3 xmlns="http://tempuri.org/">
      <pChIrsaliyeNo>${orderId}</pChIrsaliyeNo>
      <pPrKiymet></pPrKiymet>
      <pChBarkod>${orderId}</pChBarkod>
      <pChIcerik>Duvarkagidi</pChIcerik>
      <pGonderiHizmetSekli>NORMAL</pGonderiHizmetSekli>
      <pTeslimSekli>1</pTeslimSekli>
      <pFlAlSms>0</pFlAlSms>
      <pFlGnSms>0</pFlGnSms>
      <pKargoParcaList>${pKargoParcaList}</pKargoParcaList>
      <pAliciMusteriMngNo></pAliciMusteriMngNo>
      <pAliciMusteriBayiNo></pAliciMusteriBayiNo>
      <pAliciMusteriAdi><![CDATA[Test Musteri]]></pAliciMusteriAdi>
      <pChSiparisNo>${orderId}</pChSiparisNo>
      <pLuOdemeSekli>P</pLuOdemeSekli>
      <pFlAdresFarkli>0</pFlAdresFarkli>
      <pChIl><![CDATA[${il}]]></pChIl>
      <pChIlce><![CDATA[${ilce}]]></pChIlce>
      <pChAdres><![CDATA[${adres}]]></pChAdres>
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

    const res = await fetch(soapUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '"http://tempuri.org/SiparisGirisiDetayliV3"' },
        body: siparisGirisiXml
    });
    console.log("Siparis Res:", await res.text());

    const barkodXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <MNGGonderiBarkod xmlns="http://tempuri.org/">
      <req>
        <WsUserName>${dhlUser}</WsUserName>
        <WsPassword>${dhlPass}</WsPassword>
        <ReferansNo>${orderId}</ReferansNo>
        <OutBarkodType>ZPL</OutBarkodType>
        <FlKapidaTahsilat>0</FlKapidaTahsilat>
        <HatadaReferansBarkoduBas>1</HatadaReferansBarkoduBas>
      </req>
    </MNGGonderiBarkod>
  </soap:Body>
</soap:Envelope>`;

    const res2 = await fetch(soapUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '"http://tempuri.org/MNGGonderiBarkod"' },
        body: barkodXml
    });
    console.log("Barkod Res:", await res2.text());
}

testMng("İSTANBUL", "KADIKÖY", "Caddebostan mahallesi kantarci Riza sokak no:11", 999996).catch(console.error);
