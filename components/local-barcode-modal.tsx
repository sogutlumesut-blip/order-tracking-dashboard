
"use client"

import { X, Printer, RefreshCcw } from "lucide-react"
import Barcode from "react-barcode"
import QRCode from "react-qr-code"
import { useRef, useState } from "react"
import { useReactToPrint } from "react-to-print"
import { syncCargoKargoEntegrator } from "@/app/actions"
import { toast } from "sonner"

interface LocalBarcodeModalProps {
    order: {
        id: number
        barcode?: string | null
        cargoBarcode?: string | null
        customer: string
        address?: string | null
        city?: string | null
        phone?: string | null
        items?: Array<{
            name: string
            quantity: number
            sku?: string | null
            material?: string | null
            dimensions?: string | null
            image_src?: string | null
            sampleData?: string | null
        }>
        labels?: string | string[]
        cargoTrackingNumber?: string | null
        source?: string | null
        externalId?: string | null
        paymentMethod?: string | null
    } | null
    isOpen: boolean
    onClose: () => void
}

export function LocalBarcodeModal({ order, isOpen, onClose }: LocalBarcodeModalProps) {
    const printRef = useRef<HTMLDivElement>(null)
    const [isSyncing, setIsSyncing] = useState(false)
    const [isSimplified, setIsSimplified] = useState(true)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Kargo-Barkod-${order?.cargoBarcode || order?.barcode || order?.id}`,
        pageStyle: `
            @page {
                size: 100mm 150mm !important;
                margin: 0 !important;
            }
            @media print {
                html, body {
                    width: 100mm !important;
                    height: 150mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
            }
        `
    })

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const res = await syncCargoKargoEntegrator()
            if (res.success) {
                toast.success("Kargo bilgileri güncellendi. Yeni barkod birazdan yansıyacaktır.")
            } else {
                toast.error("Kargo bilgisi bulunamadı veya bir hata oluştu.")
            }
        } catch (e) {
            toast.error("Senkronizasyon başarısız.")
        } finally {
            setIsSyncing(false)
        }
    }

    if (!isOpen || !order) return null

    // Parse labels to check for USA DEPO / USA UPS
    const getLabels = (labelsStr: string | string[] | undefined): string[] => {
        if (!labelsStr) return [];
        if (Array.isArray(labelsStr)) return labelsStr;
        try {
            const parsed = typeof labelsStr === 'string' ? JSON.parse(labelsStr) : labelsStr;
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    };

    const orderLabels = getLabels(order.labels);
    const findActiveBadge = () => {
        const keywords = [
            "USA DEPO", "USA UPS", "USA", 
            "TURKEY SHIP", "TURKEY", "TR SHIP", 
            "FEDEX SHIP", "FEDEX", 
            "OZEL ETİKET", "ÖZEL ETİKET", "OZEL", "ÖZEL"
        ];
        for (const label of orderLabels) {
            const upper = label.toUpperCase();
            const matchedKeyword = keywords.find(keyword => upper.includes(keyword));
            if (matchedKeyword) {
                if (matchedKeyword.startsWith("USA")) return "USA DEPO";
                if (matchedKeyword.startsWith("TURKEY") || matchedKeyword === "TR SHIP") return "TURKEY SHIP";
                if (matchedKeyword.startsWith("FEDEX")) return "FEDEX SHIP";
                if (matchedKeyword.startsWith("OZEL") || matchedKeyword.startsWith("ÖZEL")) return "ÖZEL ETİKET";
                return label.toUpperCase();
            }
        }
        return null;
    };
    const activeBadge = findActiveBadge();

    const getPlatformName = (): string | null => {
        const src = (order.source || "").toLowerCase().trim();
        const barcode = (order.barcode || "").toUpperCase().trim();
        const payMethod = (order.paymentMethod || "").toUpperCase().trim();
        const labelsStr = orderLabels.map(l => l.toUpperCase());

        // 1. Direct source check
        if (src === 'woo' || src === 'woocommerce') return 'WOO';
        if (src === 'printmarkt') return 'PRINTMARKT';
        if (src === 'wayfair') return 'WAYFAIR';
        if (src === 'shopify') return 'SHOPIFY';
        if (src === 'etsy') return 'ETSY';

        // 2. Barcode prefix check
        if (barcode.startsWith('WC-') || barcode.startsWith('WOO-')) return 'WOO';
        if (barcode.startsWith('WF-') || barcode.startsWith('WAYFAIR-')) return 'WAYFAIR';
        if (barcode.startsWith('PM-') || barcode.startsWith('PRINTMARKT-')) return 'PRINTMARKT';
        if (barcode.startsWith('SH-') || barcode.startsWith('SHOPIFY-')) return 'SHOPIFY';
        if (barcode.startsWith('ET-') || barcode.startsWith('ETSY-')) return 'ETSY';

        // 3. Labels check
        if (labelsStr.some(l => l.includes('WOO'))) return 'WOO';
        if (labelsStr.some(l => l.includes('PRINTMARKT'))) return 'PRINTMARKT';
        if (labelsStr.some(l => l.includes('WAYFAIR'))) return 'WAYFAIR';
        if (labelsStr.some(l => l.includes('SHOPIFY'))) return 'SHOPIFY';
        if (labelsStr.some(l => l.includes('ETSY'))) return 'ETSY';

        // 4. Payment method check
        if (payMethod.includes('PRINTMARKT')) return 'PRINTMARKT';

        // 5. Fallback to source
        if (order.source && order.source.trim()) {
            return order.source.toUpperCase().trim();
        }

        return null;
    };
    const platformBadge = getPlatformName();

    const getOrderDisplayNumber = () => {
        if (order.externalId) {
            const clean = order.externalId.replace(/^pm_/, '');
            return clean.startsWith('#') ? clean : `#${clean}`;
        }
        if (order.barcode && !order.barcode.startsWith('TR')) {
            return order.barcode;
        }
        return `#${order.id}`;
    };
    const displayOrderNo = getOrderDisplayNumber();

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-bold text-lg">Barkod Yazdır</h3>
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className={`p-1.5 rounded-md transition-all ${isSyncing ? 'animate-spin text-blue-500' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                            title="Kargo Bilgilerini Güncelle"
                        >
                            <RefreshCcw className="w-4 h-4" />
                        </button>
                        
                        <label className="flex items-center gap-1.5 cursor-pointer select-none border border-slate-200 px-2 py-1 rounded bg-white hover:bg-slate-50 transition-colors">
                            <input
                                type="checkbox"
                                checked={isSimplified}
                                onChange={(e) => setIsSimplified(e.target.checked)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                            />
                            <span className="text-xs font-semibold text-slate-700">Sade (Rulo)</span>
                        </label>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Printable Content Area */}
                <div className="flex-1 overflow-auto p-8 bg-slate-100 flex justify-center">
                    <div
                        ref={printRef}
                        className="bg-white rounded text-black dark:text-black"
                        style={{ 
                            width: "100mm", 
                            height: "150mm", 
                            color: "#000000", 
                            backgroundColor: "#ffffff",
                            boxSizing: "border-box",
                            padding: "16px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            fontFamily: "Arial, sans-serif"
                        }}
                    >
                        {isSimplified ? (
                            <div style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                boxSizing: "border-box"
                            }}>
                                {/* Badge / Header */}
                                <div style={{
                                    width: "100%",
                                    borderBottom: "3px solid #000000",
                                    paddingBottom: "10px",
                                    marginBottom: "16px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center"
                                }}>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                                        <span style={{
                                            fontSize: "12px",
                                            fontWeight: "bold",
                                            letterSpacing: "0.05em",
                                            color: "#000000"
                                        }}>RULO ETİKETİ</span>
                                        {displayOrderNo && (
                                            <span style={{
                                                fontSize: "12px",
                                                fontWeight: "800",
                                                color: "#1e293b",
                                                fontFamily: "monospace"
                                            }}>
                                                {displayOrderNo}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        {platformBadge && (
                                            <div 
                                                style={{
                                                    padding: "4px 10px",
                                                    backgroundColor: '#000000',
                                                    color: '#ffffff',
                                                    fontWeight: "900",
                                                    fontSize: "12px",
                                                    borderRadius: "4px",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    WebkitPrintColorAdjust: 'exact',
                                                    printColorAdjust: 'exact',
                                                    lineHeight: "1.2"
                                                }}
                                            >
                                                {platformBadge}
                                            </div>
                                        )}
                                        {activeBadge && activeBadge !== platformBadge && (
                                            <div 
                                                style={{
                                                    padding: "4px 10px",
                                                    backgroundColor: '#000000',
                                                    color: '#ffffff',
                                                    fontWeight: "900",
                                                    fontSize: "12px",
                                                    borderRadius: "4px",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                    WebkitPrintColorAdjust: 'exact',
                                                    printColorAdjust: 'exact',
                                                    lineHeight: "1.2"
                                                }}
                                            >
                                                {activeBadge}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Customer Name (Very Large) */}
                                <div style={{
                                    marginBottom: "20px",
                                    textAlign: "left"
                                }}>
                                    <p style={{
                                        fontSize: "11px",
                                        textTransform: "uppercase",
                                        fontWeight: "bold",
                                        color: "#475569",
                                        margin: "0 0 4px 0"
                                    }}>ALICI:</p>
                                    <h2 style={{
                                        fontSize: "26px",
                                        fontWeight: "900",
                                        margin: "0",
                                        color: "#000000",
                                        lineHeight: "1.2"
                                    }}>{order.customer}</h2>
                                </div>

                                {/* Product SKU & Dimensions (Very Large) */}
                                <div style={{
                                    flex: "1",
                                    textAlign: "left",
                                    borderTop: "2px dashed #000000",
                                    paddingTop: "16px",
                                    boxSizing: "border-box",
                                    overflow: "hidden"
                                }}>
                                    <p style={{
                                        fontSize: "11px",
                                        textTransform: "uppercase",
                                        fontWeight: "bold",
                                        color: "#475569",
                                        margin: "0 0 8px 0"
                                    }}>SİPARİŞ İÇERİĞİ:</p>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                        {order.items?.map((item: any, idx: number) => (
                                            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                                                    <span style={{
                                                        fontSize: "22px",
                                                        fontWeight: "800",
                                                        color: "#000000"
                                                    }}>{item.sku || "KODSUZ"}</span>
                                                    {item.dimensions && (
                                                        <span style={{
                                                            fontSize: "18px",
                                                            fontWeight: "700",
                                                            color: "#000000"
                                                        }}>({item.dimensions})</span>
                                                    )}
                                                    <span style={{
                                                        fontSize: "18px",
                                                        fontWeight: "900",
                                                        marginLeft: "auto",
                                                        backgroundColor: "#e2e8f0",
                                                        padding: "1px 6px",
                                                        borderRadius: "4px"
                                                    }}>x{item.quantity}</span>
                                                </div>
                                                {item.material && (
                                                    <span style={{
                                                        fontSize: "11px",
                                                        color: "#4b5563",
                                                        fontWeight: "500"
                                                    }}>{item.material}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Barcode / QR Section */}
                                <div style={{
                                    width: "100%",
                                    borderTop: "3px solid #000000",
                                    paddingTop: "12px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-end",
                                    boxSizing: "border-box"
                                }}>
                                    {/* QR Code */}
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                        <QRCode
                                            value={order.barcode || order.id.toString()}
                                            size={65}
                                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                            viewBox={`0 0 256 256`}
                                            fgColor="#000000"
                                            bgColor="#ffffff"
                                        />
                                        <span style={{ fontSize: "9px", fontFamily: "monospace", marginTop: "4px" }}>
                                            {order.barcode || order.id}
                                        </span>
                                    </div>

                                    {/* Barcode */}
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                        <Barcode
                                            value={order.cargoBarcode || order.cargoTrackingNumber || order.barcode || order.id.toString()}
                                            width={1.3}
                                            height={45}
                                            fontSize={9}
                                            margin={0}
                                            lineColor="#000000"
                                        />
                                        {order.cargoTrackingNumber && (
                                            <span style={{ fontSize: "9px", fontFamily: "monospace", marginTop: "2px" }}>
                                                Takip: {order.cargoTrackingNumber}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                boxSizing: "border-box"
                            }}>
                                {/* Sender / Header */}
                                <div style={{
                                    width: "100%",
                                    borderBottom: "2px solid #000000",
                                    paddingBottom: (activeBadge || platformBadge) ? "10px" : "8px",
                                    marginBottom: "12px",
                                    textAlign: "center"
                                }}>
                                    <h1 style={{
                                        fontSize: "20px",
                                        fontWeight: "bold",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                        margin: "0 0 2px 0",
                                        color: "#000000"
                                    }}>KARGO GÖNDERİSİ</h1>
                                    <p style={{
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        margin: "0",
                                        color: "#000000"
                                    }}>Duvar Kağıdı Marketi</p>
                                    {(platformBadge || activeBadge) && (
                                        <div 
                                            style={{
                                                display: "flex",
                                                justifyContent: "center",
                                                alignItems: "center",
                                                gap: "6px",
                                                marginTop: "6px",
                                                flexWrap: "wrap"
                                            }}
                                        >
                                            {platformBadge && (
                                                <div 
                                                    style={{
                                                        padding: "4px 12px",
                                                        backgroundColor: '#000000',
                                                        color: '#ffffff',
                                                        fontWeight: "900",
                                                        fontSize: "12px",
                                                        borderRadius: "4px",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.05em",
                                                        WebkitPrintColorAdjust: 'exact',
                                                        printColorAdjust: 'exact'
                                                    }}
                                                >
                                                    {platformBadge}
                                                </div>
                                            )}
                                            {activeBadge && activeBadge !== platformBadge && (
                                                <div 
                                                    style={{
                                                        padding: "4px 12px",
                                                        backgroundColor: '#000000',
                                                        color: '#ffffff',
                                                        fontWeight: "900",
                                                        fontSize: "12px",
                                                        borderRadius: "4px",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.05em",
                                                        WebkitPrintColorAdjust: 'exact',
                                                        printColorAdjust: 'exact'
                                                    }}
                                                >
                                                    {activeBadge}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Middle: Receiver Info */}
                                <div style={{
                                    width: "100%",
                                    textAlign: "left",
                                    marginBottom: "12px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px"
                                }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                        <p style={{
                                            fontSize: "10px",
                                            textTransform: "uppercase",
                                            fontWeight: "bold",
                                            margin: "0 0 2px 0",
                                            color: "#475569"
                                        }}>ALICI:</p>
                                        {displayOrderNo && (
                                            <span style={{ fontSize: "11px", fontWeight: "bold", fontFamily: "monospace", color: "#475569" }}>
                                                {displayOrderNo}
                                            </span>
                                        )}
                                    </div>
                                    <p style={{
                                        fontSize: "16px",
                                        fontWeight: "bold",
                                        lineHeight: "1.2",
                                        margin: "0 0 2px 0",
                                        color: "#000000"
                                    }}>{order.customer}</p>
                                    <p style={{
                                        fontSize: "11px",
                                        lineHeight: "1.3",
                                        margin: "0 0 2px 0",
                                        color: "#1e293b"
                                    }}>{order.address}</p>
                                    <p style={{
                                        fontSize: "11px",
                                        fontWeight: "bold",
                                        margin: "0 0 2px 0",
                                        color: "#000000"
                                    }}>{order.city}</p>
                                    <p style={{
                                        fontSize: "11px",
                                        margin: "0",
                                        color: "#000000"
                                    }}>{order.phone}</p>
                                </div>

                                {/* Middle: Order Content */}
                                <div style={{
                                    width: "100%",
                                    textAlign: "left",
                                    marginBottom: "12px",
                                    flex: "1",
                                    overflow: "hidden",
                                    borderTop: "1px solid #e2e8f0",
                                    paddingTop: "8px",
                                    boxSizing: "border-box"
                                }}>
                                    <p style={{
                                        fontSize: "10px",
                                        textTransform: "uppercase",
                                        fontWeight: "bold",
                                        margin: "0 0 6px 0",
                                        color: "#475569"
                                    }}>SİPARİŞ İÇERİĞİ:</p>
                                    <div style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "8px"
                                    }}>
                                        {order.items?.map((item: any, idx: number) => {
                                            const imgUrls = (item.image_src || "").split('|').filter(Boolean);
                                            const firstImg = item.croppedImage || imgUrls[0];
                                            return (
                                                <div key={idx} style={{
                                                    display: "flex",
                                                    flexDirection: "row",
                                                    gap: "8px",
                                                    alignItems: "flex-start",
                                                    borderBottom: idx === ((order.items?.length || 0) - 1) ? "none" : "1px solid #f1f5f9",
                                                    paddingBottom: "8px",
                                                    boxSizing: "border-box"
                                                }}>
                                                    {firstImg && (
                                                        <div style={{
                                                            width: "48px",
                                                            height: "48px",
                                                            flexShrink: 0,
                                                            backgroundColor: "#f1f5f9",
                                                            borderRadius: "4px",
                                                            border: "1px solid #e2e8f0",
                                                            overflow: "hidden",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            boxSizing: "border-box"
                                                        }}>
                                                            <img
                                                                src={firstImg}
                                                                alt=""
                                                                style={{
                                                                    width: "48px",
                                                                    height: "48px",
                                                                    objectFit: "cover",
                                                                    display: "block"
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    <div style={{
                                                        flex: "1",
                                                        minWidth: "0",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: "4px"
                                                    }}>
                                                        <div style={{
                                                            display: "flex",
                                                            flexDirection: "row",
                                                            justifyContent: "space-between",
                                                            alignItems: "flex-start",
                                                            gap: "8px"
                                                        }}>
                                                            <p style={{
                                                                fontSize: "11px",
                                                                fontWeight: "bold",
                                                                lineHeight: "1.2",
                                                                textTransform: "uppercase",
                                                                margin: "0",
                                                                color: "#000000",
                                                                wordBreak: "break-word"
                                                            }}>
                                                                {item.name}
                                                            </p>
                                                            <p style={{
                                                                fontSize: "11px",
                                                                fontWeight: "900",
                                                                color: "#000000",
                                                                backgroundColor: "#e2e8f0",
                                                                padding: "2px 6px",
                                                                borderRadius: "4px",
                                                                margin: "0",
                                                                whiteSpace: "nowrap"
                                                            }}>
                                                                x{item.quantity}
                                                            </p>
                                                        </div>
                                                        <div style={{
                                                            display: "flex",
                                                            flexDirection: "row",
                                                            flexWrap: "wrap",
                                                            gap: "4px"
                                                        }}>
                                                            {item.sku && (
                                                                <span style={{
                                                                    fontSize: "9px",
                                                                    fontWeight: "bold",
                                                                    color: "#1f2937",
                                                                    backgroundColor: "#f1f5f9",
                                                                    border: "1px solid #e2e8f0",
                                                                    padding: "1px 4px",
                                                                    borderRadius: "3px"
                                                                }}>
                                                                    KOD: {item.sku}
                                                                </span>
                                                            )}
                                                            {item.material && (
                                                                <span style={{
                                                                    fontSize: "9px",
                                                                    color: "#4b5563",
                                                                    backgroundColor: "#f8fafc",
                                                                    border: "1px solid #e2e8f0",
                                                                    padding: "1px 4px",
                                                                    borderRadius: "3px"
                                                                }}>
                                                                    {item.material}
                                                                </span>
                                                            )}
                                                            {item.dimensions && (
                                                                <span style={{
                                                                    fontSize: "9px",
                                                                    fontWeight: "bold",
                                                                    color: "#065f46",
                                                                    backgroundColor: "#ecfdf5",
                                                                    border: "1px solid #a7f3d0",
                                                                    padding: "1px 4px",
                                                                    borderRadius: "3px"
                                                                }}>
                                                                    📏 {item.dimensions}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Bottom: Barcode & QR Code */}
                                <div style={{
                                    marginTop: "auto",
                                    width: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "flex-end",
                                    borderTop: "2px solid #000000",
                                    paddingTop: "12px",
                                    boxSizing: "border-box"
                                }}>
                                    <div style={{
                                        display: "flex",
                                        flexDirection: "row",
                                        alignItems: "flex-end",
                                        justifyContent: "space-between",
                                        gap: "16px",
                                        width: "100%",
                                        boxSizing: "border-box"
                                    }}>
                                        {/* Left: Internal QR for Ready/Packed */}
                                        <div style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            flex: "1",
                                            minWidth: "0"
                                        }}>
                                            <p style={{
                                                fontSize: "10px",
                                                fontWeight: "bold",
                                                margin: "0 0 4px 0",
                                                color: "#475569"
                                            }}>SİTEM (QR)</p>
                                            <div style={{
                                                width: "70px",
                                                height: "70px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center"
                                            }}>
                                                <QRCode
                                                    value={order.barcode || order.id.toString()}
                                                    size={70}
                                                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                                    viewBox={`0 0 256 256`}
                                                    fgColor="#000000"
                                                    bgColor="#ffffff"
                                                />
                                            </div>
                                            <p style={{
                                                fontSize: "10px",
                                                fontFamily: "monospace",
                                                margin: "4px 0 0 0",
                                                color: "#000000"
                                            }}>{order.barcode || order.id}</p>
                                        </div>

                                        {/* Right: Cargo Barcode for Shipped */}
                                        <div style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            flex: "2",
                                            minWidth: "0"
                                        }}>
                                            <p style={{
                                                fontSize: "10px",
                                                fontWeight: "bold",
                                                margin: "0 0 4px 0",
                                                color: "#475569"
                                            }}>KARGO (DHL/STANDART)</p>
                                            <div style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                width: "100%"
                                            }}>
                                                <Barcode
                                                    value={order.cargoBarcode || order.cargoTrackingNumber || order.barcode || order.id.toString()}
                                                    width={1.4}
                                                    height={50}
                                                    fontSize={10}
                                                    margin={0}
                                                    lineColor="#000000"
                                                />
                                            </div>
                                            {order.cargoTrackingNumber && (
                                                <p style={{
                                                    fontSize: "9px",
                                                    fontFamily: "monospace",
                                                    margin: "2px 0 0 0",
                                                    color: "#1f2937"
                                                }}>Takip: {order.cargoTrackingNumber}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t bg-slate-50 flex gap-3">
                    <button
                        onClick={() => handlePrint()}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl"
                    >
                        <Printer className="w-5 h-5" />
                        Yazdır
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-3 border border-slate-300 hover:bg-slate-100 rounded-lg font-medium text-slate-700 transition-colors"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </div>
    )
}
