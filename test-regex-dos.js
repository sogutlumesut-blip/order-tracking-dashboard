const address = "İSTASYON MH. NİLÜFER CAD. AÇELYA SOK. NO:7/1 TRAKYA BORU";
console.log("Starting regex match...");
const addressMatch = address.match(/\b([A-ZŞİĞÜÇÖa-zşıiğüçö]+)\s*\/\s*([A-ZŞİĞÜÇÖa-zşıiğüçö]+)\b/);
console.log("Finished! Result:", addressMatch);
