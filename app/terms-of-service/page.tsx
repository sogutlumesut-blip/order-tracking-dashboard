import Link from "next/link";

export default function TermsOfService() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
            <div className="prose prose-slate max-w-none space-y-6">
                <p className="text-lg">By using this platform, you agree to the following terms:</p>

                <section>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>This service provides order tracking and management tools.</li>
                        <li>We do not guarantee uninterrupted or error-free service.</li>
                        <li>Users are responsible for maintaining the security of their accounts.</li>
                        <li>We reserve the right to suspend or terminate access if misuse is detected.</li>
                    </ul>
                </section>

                <section>
                    <p className="font-medium">The service is provided "as is" without warranties of any kind.</p>
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
