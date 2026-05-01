'use client';

import Link from "next/link";
import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export function Footer() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <footer className="py-2 border-t bg-white dark:bg-[#020617] transition-colors duration-300">
            <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-2 text-[10px] md:text-xs text-slate-500">
                <div className="flex w-full items-center justify-between md:justify-center">
                    <p className="hidden md:block">&copy; {new Date().getFullYear()} Sipariş Takip Sistemi. Tüm hakları saklıdır.</p>
                    
                    <button 
                        onClick={() => setIsOpen(!isOpen)} 
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md mx-auto"
                    >
                        Yasal Bilgiler {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    </button>
                </div>

                {/* Collapsible Content */}
                <div className={`${isOpen ? 'flex' : 'hidden'} flex-col justify-between w-full items-center gap-4 mt-2`}>
                    <p className="text-center w-full">&copy; {new Date().getFullYear()} Sipariş Takip Sistemi. Tüm hakları saklıdır.</p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <Link href="/privacy-policy" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                            Privacy Policy
                        </Link>
                        <Link href="/terms-of-service" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                            Terms of Service
                        </Link>
                        <Link href="/data-deletion" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                            Data Deletion
                        </Link>
                    </div>
                </div>

                <div className={`${isOpen ? 'block' : 'hidden'} text-center opacity-60 max-w-2xl border-t pt-2 w-full mt-2`}>
                    The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.
                </div>
            </div>
        </footer>
    );
}
