import LegalNav from "@/components/LegalNav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Ally",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <LegalNav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="prose prose-gray max-w-none">
          <h1 className="text-3xl font-bold text-[#1a1a2e] mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Effective Date: January 1, 2026 · Last Updated: June 2026</p>

          <Section title="1. Who We Are">
            <p><strong>Ally, Inc.</strong> is a Delaware C Corporation (EIN: 37-2215465) operating Ally AI Assistant at allyapp.one. We are the data controller for all personal data processed through Ally.</p>
            <p className="mt-3"><strong>Contact:</strong> info@allyapp.one · Data rights portal: allyapp.one/privacy/my-data</p>
          </Section>

          <Section title="2. What Data We Collect">
            <h3 className="font-semibold text-[#1a1a2e] mt-4 mb-2">2.1 Registration Data</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-3 py-2 text-left">Data</th><th className="border border-gray-200 px-3 py-2 text-left">Purpose</th><th className="border border-gray-200 px-3 py-2 text-left">Basis</th></tr></thead>
                <tbody>
                  <tr><td className="border border-gray-200 px-3 py-2">Phone number</td><td className="border border-gray-200 px-3 py-2">Account creation and OTP auth</td><td className="border border-gray-200 px-3 py-2">Contract</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Name</td><td className="border border-gray-200 px-3 py-2">Personalisation and network display</td><td className="border border-gray-200 px-3 py-2">Contract</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Date of birth</td><td className="border border-gray-200 px-3 py-2">Age verification</td><td className="border border-gray-200 px-3 py-2">Legal obligation</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">City</td><td className="border border-gray-200 px-3 py-2">Assistant context</td><td className="border border-gray-200 px-3 py-2">Contract</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold text-[#1a1a2e] mt-6 mb-2">2.2 Contact Data</h3>
            <p>When you grant phonebook access, we import names and phone numbers. Words revealing sexual orientation, health conditions, or romantic history are <strong>blocked at import and never stored</strong>.</p>

            <h3 className="font-semibold text-[#1a1a2e] mt-6 mb-2">2.3 Conversation Data</h3>
            <p>Conversations are stored for <strong>12 months</strong>; summaries for <strong>3 years</strong>. You may request immediate deletion from Settings at any time.</p>

            <h3 className="font-semibold text-[#1a1a2e] mt-6 mb-2">2.4 Technical Data</h3>
            <p>Device type, OS, app version, IP address (fraud prevention only), session duration, feature usage. Analytics via PostHog (no PII). Error monitoring via Sentry (anonymised).</p>
          </Section>

          <Section title="3. How We Use Your Data">
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide and personalise the Ally AI Assistant</li>
              <li>Enable network intelligence features</li>
              <li>Process payments via Paddle (Merchant of Record)</li>
              <li>Detect and prevent fraud</li>
              <li>Train AI models using anonymised, aggregated patterns (k-anonymity ≥10)</li>
            </ul>
            <p className="mt-3 font-semibold">We do not use your data for advertising. We do not show you ads. We do not sell your data.</p>
          </Section>

          <Section title="4. Who We Share Your Data With">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-3 py-2 text-left">Processor</th><th className="border border-gray-200 px-3 py-2 text-left">Purpose</th></tr></thead>
                <tbody>
                  <tr><td className="border border-gray-200 px-3 py-2">Anthropic (Claude API)</td><td className="border border-gray-200 px-3 py-2">AI conversation processing — no data retained beyond the API call</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Supabase (Frankfurt, Germany)</td><td className="border border-gray-200 px-3 py-2">Database hosting</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Railway (Frankfurt, Germany)</td><td className="border border-gray-200 px-3 py-2">Backend hosting</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Paddle (Paddle.com Market Ltd)</td><td className="border border-gray-200 px-3 py-2">Merchant of Record — billing, payments, tax</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Bridge (USA)</td><td className="border border-gray-200 px-3 py-2">USDT payout processing and KYC for withdrawals</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="5. Data Retention">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-3 py-2 text-left">Data Type</th><th className="border border-gray-200 px-3 py-2 text-left">Retention</th></tr></thead>
                <tbody>
                  <tr><td className="border border-gray-200 px-3 py-2">Account data</td><td className="border border-gray-200 px-3 py-2">Duration of account + 30 days</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Conversation messages</td><td className="border border-gray-200 px-3 py-2">12 months</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Conversation summaries</td><td className="border border-gray-200 px-3 py-2">3 years</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Payment records</td><td className="border border-gray-200 px-3 py-2">7 years (legal requirement)</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="6. Your Rights (GDPR)">
            <ul className="list-disc pl-6 space-y-1">
              <li>Right of access, rectification, and erasure</li>
              <li>Right to data portability</li>
              <li>Right to object to processing based on legitimate interests</li>
              <li>Right to withdraw consent at any time</li>
            </ul>
            <p className="mt-3">Exercise rights at: <a href="https://allyapp.one/privacy/my-data" className="text-[#29a9e1] hover:underline">allyapp.one/privacy/my-data</a> or email info@allyapp.one. We respond within 30 days.</p>
          </Section>

          <Section title="7. Security">
            <p>TLS encryption in transit · AES-256 at rest · Two-factor authentication for system access · Periodic penetration testing · 72-hour breach notification to supervisory authorities.</p>
          </Section>

          <Section title="8. Contact">
            <p><strong>Email:</strong> info@allyapp.one<br />
            <strong>Data rights portal:</strong> allyapp.one/privacy/my-data<br />
            <strong>Legal:</strong> Ally, Inc. c/o Tornike Abuladze, 1328 Botetourt Gardens, Norfolk, VA 23517, USA</p>
          </Section>
        </div>
      </main>
      <LegalNav />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-[#1a1a2e] mb-3 mt-8">{title}</h2>
      <div className="text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}
