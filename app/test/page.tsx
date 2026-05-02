import { createManualOrder } from '../actions';

export default async function TestPage() {
    let result = "Running...";
    try {
        const payload = {
            customer: "KARDEŞLER TARIM",
            phone: "0541 823 07 23",
            email: "kardeslertarimcilik@hotmail.com",
            address: "Yenişehir Mah Şehit Ender Güven Sok No: 14 İZMİT / KOCAELİ",
            city: "İZMİT",
            productName: "Antik su peri",
            sku: "PM-899265",
            material: "Dokusuz Duvar Kağıdı",
            note: "3 adet çıta içi",
            status: "pending_woo",
            items: [{
                name: "Antik su peri",
                sku: "PM-899265",
                quantity: 1,
                image_src: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/",
                material: "Dokusuz Duvar Kağıdı",
                dimensions: "65 x 155 cm (1.01 m²)",
                url: null
            }]
        };
        await createManualOrder(payload);
        result = "Success!";
    } catch (e: any) {
        result = "Error: " + e.message;
    }

    return <div>{result}</div>;
}
