let il = "ISTANBUL";
let ilce = "SISLI";

const tryParseLoc = (str) => {
    if (!str) return false;
    const parts = str.split('/').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
        il = parts[parts.length - 1].toUpperCase();
        let rawIlce = parts[parts.length - 2].toUpperCase();
        let match = rawIlce.match(/[A-ZÇĞİÖŞÜçğıöşü\s]+$/);
        if (match && match[0].trim().length > 2) {
            ilce = match[0].trim();
        } else {
            ilce = rawIlce; // fallback
        }
        return true;
    }
    return false;
};

const address = "başakşehir mh 3. istanbul hasbahçe evleri b1/28 başakşehir / İSTANBUL";
tryParseLoc(address);
console.log({il, ilce});
