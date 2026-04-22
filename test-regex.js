const barkodText = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope><soap:Body><MNGGonderiBarkodResponse><MNGGonderiBarkodResult><GonderiBarkods><GonderiBarkodBilgi><BarkodText>^XA^FT555,45^A0R,23,24^FH^FDMESAJ : 1133 NO'LU SİPARİŞ KAYDI İÇİN VARIŞ ŞUBESİ BULUNAMAD^FS^PQ1,0,1,Y^XZ</BarkodText></GonderiBarkodBilgi></GonderiBarkods></MNGGonderiBarkodResult></MNGGonderiBarkodResponse></soap:Body></soap:Envelope>`;

const zplMatch = barkodText.match(/<BarkodText>([\s\S]*?)<\/BarkodText>/);
let zplContent = zplMatch ? Buffer.from(zplMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).toString('utf-8') : null;

console.log("zplContent:", zplContent);
console.log("Includes MESAJ : ", zplContent.includes("MESAJ :"));
console.log("Includes VARIŞ : ", zplContent.includes("VARIŞ ŞUBESİ BULUNAMAD"));

