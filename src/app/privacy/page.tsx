import LegalNav, { LegalFooter } from "@/components/LegalNav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Netai",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <LegalNav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="legal-body max-w-none">
          <h1 className="legal-h1 mb-2">Privacy Policy</h1>
          <p className="legal-meta mb-8">Effective Date: January 1, 2026 · Last Updated: June 2026</p>

          <Section title="1. Who We Are">
            <p><strong>Ally, Inc.</strong> is a Delaware C Corporation (EIN: 37-2215465) operating Ally AI Assistant at allyapp.one. We are the data controller for all personal data processed through Ally.</p>
            <p className="mt-3"><strong>Contact:</strong> info@allyapp.one · Data rights portal: allyapp.one/privacy/my-data</p>
          </Section>

          <Section title="2. What Data We Collect">
            <h3 className="legal-h3 mt-4 mb-2">2.1 Registration Data</h3>
            <div className="overflow-x-auto">
              <table className="legal-table">
                <thead><tr><th>Data</th><th>Purpose</th><th>Basis</th></tr></thead>
                <tbody>
                  <tr><td>Phone number</td><td>Account creation and OTP auth</td><td>Contract</td></tr>
                  <tr><td>Name</td><td>Personalisation and network display</td><td>Contract</td></tr>
                  <tr><td>Date of birth</td><td>Age verification</td><td>Legal obligation</td></tr>
                  <tr><td>City</td><td>Assistant context</td><td>Contract</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="legal-h3 mt-6 mb-2">2.2 Contact Data</h3>
            <p>When you grant phonebook access, we import names and phone numbers. Words revealing sexual orientation, health conditions, or romantic history are <strong>blocked at import and never stored</strong>.</p>

            <h3 className="legal-h3 mt-6 mb-2">2.3 Conversation Data</h3>
            <p>Conversations are stored for <strong>12 months</strong>; summaries for <strong>3 years</strong>. You may request immediate deletion from Settings at any time.</p>

            <h3 className="legal-h3 mt-6 mb-2">2.4 Technical Data</h3>
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
              <table className="legal-table">
                <thead><tr><th>Processor</th><th>Purpose</th></tr></thead>
                <tbody>
                  <tr><td>Anthropic (Claude API)</td><td>AI conversation processing — no data retained beyond the API call</td></tr>
                  <tr><td>Supabase (Frankfurt, Germany)</td><td>Database hosting</td></tr>
                  <tr><td>Railway (Frankfurt, Germany)</td><td>Backend hosting</td></tr>
                  <tr><td>Paddle (Paddle.com Market Ltd)</td><td>Merchant of Record — billing, payments, tax</td></tr>
                  <tr><td>Bridge (USA)</td><td>USDT payout processing and KYC for withdrawals</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="5. Data Retention">
            <div className="overflow-x-auto">
              <table className="legal-table">
                <thead><tr><th>Data Type</th><th>Retention</th></tr></thead>
                <tbody>
                  <tr><td>Account data</td><td>Duration of account + 30 days</td></tr>
                  <tr><td>Conversation messages</td><td>12 months</td></tr>
                  <tr><td>Conversation summaries</td><td>3 years</td></tr>
                  <tr><td>Payment records</td><td>7 years (legal requirement)</td></tr>
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
            <p className="mt-3">Exercise rights at: <a href="https://allyapp.one/privacy/my-data" className="legal-link">allyapp.one/privacy/my-data</a> or email info@allyapp.one. We respond within 30 days.</p>
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
      <LegalFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="legal-h2 mb-3 mt-8">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
