const fs = require('fs');

async function testZpl() {
  const zpl = `
^XA
^PW812
^LL1218
^CI28
^FO50,50^A0N,40,40^FDTEST SİPARİŞ İÇERİĞİ^FS
^FO50,100^A0N,30,30^FDOrmen Temalı Duvar Kağıdı x 1^FS
^FO50,140^A0N,20,20^FDKOD: SH2396 - Tekstil Duvar Kağıdı - 360 x 270 cm^FS

^FO50,180^GB700,2,2^FS

^FO50,200^A0N,30,30^FDTek Ürünlü Test x 2^FS
^FO50,240^A0N,20,20^FDKOD: 1234 - Kendinden Yapışkanlı - 200 x 200 cm^FS

^FO100,500^BQN,2,6^FDQA,WC-107823^FS
^FO100,650^A0N,20,20^FDWC-107823^FS

^FO400,500^BY3,3,100^BCN,100,Y,N,N^FD123456789^FS
^FO400,620^A0N,20,20^FDTakip: 123456789^FS

^FO50,700^A0N,20,20^FDNOT: Bu bir test notudur, musteri acil demis yolla hemen.^FS
^XZ
`;

  try {
    const response = await fetch("http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/", {
        method: "POST",
        headers: {
            "Accept": "application/pdf"
        },
        body: zpl 
    });
    
    // Save PDF
    const buf = await response.arrayBuffer();
    fs.writeFileSync('test-labelary.pdf', Buffer.from(buf));
    console.log("Saved test-labelary.pdf. Please review layout.");
  } catch (err) {
    console.error(err);
  }
}
testZpl();
