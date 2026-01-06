export type OrderStatus = 'pending' | 'processing' | 'printed' | 'shipped' | 'completed';

export interface Comment {
    id: string;
    author: string;
    message: string;
    timestamp: string;
    attachments?: { name: string; type: 'image' | 'file'; url: string }[];
}

export interface OrderItem {
    id: number;
    name: string;
    quantity: number;
    image_src: string;
    sku?: string | null; // Product Code
    url?: string | null; // Special File Link
    material?: string | null;
    dimensions?: string | null;
    productNote?: string | null;
    sampleData?: string | null;
}

export interface Order {
    id: number;
    customer: string
    phone?: string | null
    email?: string | null
    address?: string | null
    city?: string | null
    total: string;
    status: OrderStatus;
    items: OrderItem[];
    date: string;
    note?: string;
    // New Fields
    labels: string[]; // e.g., 'Acil', 'Yurtiçi', 'Özel İstek'
    assignedTo?: string; // e.g., 'Ahmet Usta'
    trackingNumber?: string;
    printNotes?: string;
    barcode?: string; // For auto-scanning (usually same as ID or special SKU)
    paymentMethod?: string; // e.g. "Kredi Kartı", "Havale"
    comments?: Comment[];
    hasNotification?: boolean;
    updatedAt: string; // ISO String
    cargoBarcode?: string; // From kargo entegrator
    cargoTrackingNumber?: string;
}

export const MOCK_ORDERS: Order[] = [
    {
        id: 1001,
        customer: "Ahmet Yılmaz",
        total: "1.250 ₺",
        status: "pending",
        date: "2023-12-20",
        labels: ["Acil"],
        barcode: "TR1001",
        items: [
            {
                id: 1,
                name: "Modern Mermer Duvar Kağıdı",
                quantity: 1,
                image_src: "https://images.unsplash.com/photo-1615529328331-f8917597711f?q=80&w=600"
            }
        ],
        updatedAt: "2023-12-20T10:00:00.000Z"
    },
    {
        id: 1002,
        customer: "Ayşe Demir",
        total: "3.400 ₺",
        status: "processing",
        date: "2023-12-21",
        note: "Lütfen paketlemeye dikkat edin, hediye olacak.",
        labels: ["Hediye", "Özel Paket"],
        assignedTo: "Mehmet Usta",
        barcode: "TR1002",
        items: [
            {
                id: 2,
                name: "Orman Manzaralı (Dev Boyut)",
                quantity: 1,
                image_src: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=600"
            }
        ],
        updatedAt: "2023-12-21T11:00:00.000Z"
    },
    {
        id: 1003,
        customer: "Mehmet K.",
        total: "850 ₺",
        status: "pending",
        date: "2023-12-22",
        labels: [],
        barcode: "TR1003",
        items: [
            {
                id: 3,
                name: "Geometrik Desen",
                quantity: 2,
                image_src: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=600"
            }
        ],
        updatedAt: "2023-12-22T09:00:00.000Z"
    },
    {
        id: 1004,
        customer: "Zeynep S.",
        total: "2.100 ₺",
        status: "printed",
        date: "2023-12-19",
        labels: ["Yurtdışı"],
        assignedTo: "Ali Usta",
        printNotes: "Renkler koyu basıldı, kontrol edildi.",
        barcode: "TR1004",
        items: [
            {
                id: 4,
                name: "Soyut Renkler",
                quantity: 1,
                image_src: "https://images.unsplash.com/photo-1549490349-8643362247b5?q=80&w=600"
            }
        ],
        updatedAt: "2023-12-19T14:00:00.000Z"
    },
    {
        id: 1005,
        customer: "Ofis Mimarlık",
        total: "15.000 ₺",
        status: "shipped",
        date: "2023-12-18",
        labels: ["Kurumsal", "Yüksek Tonaj"],
        trackingNumber: "1Z999AA10123456784",
        barcode: "TR1005",
        items: [
            {
                id: 5,
                name: "Ofis Özel Koleksiyon",
                quantity: 10,
                image_src: "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=600"
            }
        ],
        updatedAt: "2023-12-18T16:00:00.000Z"
    }
];
