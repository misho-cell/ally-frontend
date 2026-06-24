import LegalNav from "@/components/LegalNav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions — Ally",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <LegalNav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="prose prose-gray max-w-none">
          <h1 className="text-3xl font-bold text-[#1a1a2e] mb-2">Terms and Conditions</h1>
          <p className="text-sm text-gray-500 mb-8">Effective Date: January 1, 2026 · Last Updated: June 2026</p>

          <blockquote className="border-l-4 border-gray-200 pl-4 text-gray-600 italic mb-8">
            Please read these Terms and Conditions carefully before using Ally. By creating an account or using the service, you agree to be bound by these terms in their entirety.
          </blockquote>

          <Section title="1. About Ally and These Terms">
            <p><strong>Ally, Inc.</strong> is a Delaware C Corporation (Delaware File Number: 10433763; EIN: 37-2215465). Our registered agent is Corporation Service Company (CSC), 251 Little Falls Drive, Wilmington, New Castle County, Delaware 19808, USA.</p>
            <p className="mt-3">Ally operates <strong>Ally AI Assistant</strong>, a personal AI assistant accessible at allyapp.one and via our Progressive Web App (PWA). These Terms govern your access to and use of the Ally service.</p>
          </Section>

          <Section title="2. Eligibility">
            <p>Minimum age by country of registered phone number:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Argentina:</strong> 13 years old</li>
              <li><strong>Georgia:</strong> 14 years old</li>
              <li><strong>EU/EEA:</strong> 16 years old (GDPR Article 8)</li>
            </ul>
            <p className="mt-3">You must be at least <strong>18 years old</strong> to earn or withdraw referral commissions.</p>
          </Section>

          <Section title="3. Your Account">
            <p>You register using your phone number. You are responsible for maintaining the security of your account. Contact us immediately at info@allyapp.one if you suspect unauthorised access.</p>
          </Section>

          <Section title="4. The Service">
            <p>Ally is a personal AI assistant that learns your contacts, helps identify the right person for a need, enables anonymous problem-routing, and proactively suggests actions. Ally is <strong>not</strong> a professional advisor, guaranteed connection service, background check service, or data broker.</p>
            <p className="mt-3">AI systems can make mistakes. Exercise independent judgement before acting on any suggestion. Ally, Inc. is not liable for decisions you make based on the assistant&apos;s responses.</p>
          </Section>

          <Section title="5. Subscriptions, Billing, and Payments">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse mt-2">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left">Tier</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Monthly</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Annual</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="border border-gray-200 px-3 py-2">Free</td><td className="border border-gray-200 px-3 py-2">$0</td><td className="border border-gray-200 px-3 py-2">$0</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Premium</td><td className="border border-gray-200 px-3 py-2">$2.99</td><td className="border border-gray-200 px-3 py-2">$29.99</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Pro</td><td className="border border-gray-200 px-3 py-2">$19.99</td><td className="border border-gray-200 px-3 py-2">$179.99</td></tr>
                  <tr><td className="border border-gray-200 px-3 py-2">Enterprise</td><td className="border border-gray-200 px-3 py-2">$79.00</td><td className="border border-gray-200 px-3 py-2">$599.99</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">Every new account begins with a <strong>5-day full-feature trial</strong>. The trial begins on your first assistant conversation — not on registration. Payment is processed by <strong>Paddle (Paddle.com Market Ltd)</strong>, our Merchant of Record.</p>
            <p className="mt-3">Subscriptions renew automatically until cancelled. You may cancel at any time from Settings. No partial refunds for unused subscription time, except where required by law.</p>
          </Section>

          <Section title="6. Referral and Earnings Programme">
            <p>The programme runs for <strong>12 months per market</strong> from that market&apos;s launch date. You must hold an active paid subscription and be at least 18 to earn commissions. Base commission rate is 4%, earnable up to 8% via milestones, up to 6 levels deep on first payments only.</p>
            <p className="mt-3">Minimum withdrawal: $10.00 USD. Payouts in USDT (TRC-20 or ERC-20). Balances expire after 120 days of inactivity.</p>
          </Section>

          <Section title="7. Your Responsibilities">
            <p>You agree to use Ally only for lawful purposes. You must not harass, stalk, or make unwanted contact; import contacts without a genuine pre-existing relationship; attempt to reverse-engineer or scrape Ally; or share your account with any third party.</p>
          </Section>

          <Section title="8. Data and Privacy">
            <p>Your use of Ally is subject to our <a href="/privacy" className="text-[#29a9e1] hover:underline">Privacy Policy</a>. Conversation messages are retained for 12 months; summaries for 3 years. You may request deletion at any time from Settings.</p>
          </Section>

          <Section title="9. Intellectual Property">
            <p>You retain ownership of your data. By using Ally, you grant us a limited licence to process that data solely to provide the service. We do not claim ownership of your data.</p>
          </Section>

          <Section title="10. Termination">
            <p>You may delete your account at any time via Settings → Delete Account. We may suspend accounts for Terms breaches, fraud, or harm to others. We will always provide data export access before permanent closure, except in cases of serious fraud.</p>
          </Section>

          <Section title="11. Disclaimers and Limitation of Liability">
            <p>We do not guarantee uninterrupted availability. AI responses may contain errors — use them at your own risk. Ally&apos;s total aggregate liability shall not exceed amounts you paid in the 12 months preceding the claim. We are not liable for indirect or consequential damages.</p>
          </Section>

          <Section title="12. Governing Law">
            <p>These Terms are governed by the laws of the <strong>State of Delaware, USA</strong>. EU consumers may bring proceedings in their country of residence.</p>
          </Section>

          <Section title="13. Changes">
            <p>Material changes will be communicated with at least 30 days&apos; notice by email and in-app notification.</p>
          </Section>

          <Section title="14. Contact">
            <p><strong>Email:</strong> info@allyapp.one<br />
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
