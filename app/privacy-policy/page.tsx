import Link from "next/link";

export default function PrivacyPolicy() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
            <div className="prose prose-slate max-w-none space-y-6">
                <p className="text-lg">We respect your privacy and are committed to protecting your personal data.</p>
                <p>This platform collects and processes limited data from connected Etsy shops in order to provide order tracking and fulfillment services.</p>

                <section>
                    <h2 className="text-xl font-semibold">Information We Collect</h2>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Etsy shop ID</li>
                        <li>Access and refresh tokens</li>
                        <li>Order and transaction data</li>
                        <li>Customer name, shipping address, and order details</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">How We Use Your Information</h2>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>To display and manage your orders</li>
                        <li>To process and fulfill customer purchases</li>
                        <li>To provide customer support</li>
                    </ul>
                    <p className="mt-4 font-medium italic">We do not sell, rent, or share your personal information with third parties.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">Data Storage & Security</h2>
                    <p>All data is stored securely and access is restricted to authorized personnel only.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">Data Retention</h2>
                    <p>We retain data only as long as necessary to provide our services.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">Your Rights</h2>
                    <p>You may request access to or deletion of your data at any time by contacting:</p>
                    <p className="font-bold">📧 info@duvarkagidimarketi.com</p>
                </section>
            </div>
            <div className="mt-12 pt-8 border-t flex gap-4">
                <Link href="/" className="text-slate-500 hover:text-slate-900 transition-colors">
                    Back to Dashboard
                </Link>
                <Link href="/data-deletion" className="text-blue-600 hover:underline">
                    Data Deletion Request
                </Link>
            </div>
        </div>
    );
}
