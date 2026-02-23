import Link from "next/link";

export default function DataDeletion() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold mb-8">Data Deletion Policy</h1>
            <div className="prose prose-slate max-w-none space-y-6">
                <p className="text-lg">Users may request deletion of their data by sending an email to:</p>

                <section className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                    <p className="font-bold text-xl mb-2">📧 info@duvarkagidimarketi.com</p>
                    <p className="text-slate-600">Please include your shop name and registered email address.</p>
                </section>

                <section>
                    <p>All associated Etsy data will be permanently deleted within 30 days of request.</p>
                </section>
            </div>
            <div className="mt-12 pt-8 border-t">
                <Link href="/" className="text-slate-500 hover:text-slate-900 transition-colors">
                    Back to Dashboard
                </Link>
            </div>
        </div>
    );
}
