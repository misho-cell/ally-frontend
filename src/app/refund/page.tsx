import LegalNav from "@/components/LegalNav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy — Ally",
};

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-white">
      <LegalNav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="prose prose-gray max-w-none">
          <h1 className="text-3xl font-bold text-[#1a1a2e] mb-2">Refund Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Effective Date: January 1, 2026 · Last Updated: June 2026</p>

          <p className="text-gray-700 mb-8">Ally subscriptions and purchases are processed by <strong>Paddle (Paddle.com Market Ltd)</strong>, our Merchant of Record — the legal seller of record for all Ally transactions. Paddle handles all billing, payment processing, and refund administration on our behalf.</p>

          <Section title="1. Free Trial">
            <p>Every new Ally account begins with a <strong>5-day full-feature trial</strong> at no cost. The trial begins on your first assistant conversation — not on registration. If you do not subscribe before the trial ends, your account automatically moves to the free tier. No payment is taken and no refund request is necessary.</p>
          </Section>

          <Section title="2. Subscription Cancellation">
            <p>You may cancel at any time from <strong>Settings → Subscription</strong>. Cancellation takes effect at the end of your current billing period — you retain full access until that date. Ally does not terminate access mid-period upon cancellation.</p>
          </Section>

          <Section title="3. Subscription Refunds">
            <p>Ally does not provide partial refunds for unused subscription time, except where required by applicable law.</p>
            <p className="mt-3">If the Ally service has not been delivered at all, you may request a full refund within <strong>14 days of payment</strong> by contacting info@allyapp.one.</p>
            <p className="mt-3">Annual subscription refunds and upgrade/downgrade prorations are handled by Paddle as Merchant of Record.</p>
          </Section>

          <Section title="4. Usage Token Top-Ups">
            <p>Consumed tokens are non-refundable. Unconsumed tokens follow Paddle&apos;s default refund policy. Nothing here limits any statutory refund right you have under applicable law.</p>
          </Section>

          <Section title="5. Referral Commission Reversals">
            <p>If a subscription payment that generated a referral commission is subsequently refunded or charged back, the related commission is reversed. A reversed commission creates a negative balance deducted from future earnings.</p>
          </Section>

          <Section title="6. Argentine Consumer Rights (Ley 24.240 Art. 34)">
            <p>If you reside in <strong>Argentina</strong>, you have a statutory right to revoke this distance contract within <strong>10 calendar days</strong> from the date of subscription, without reason and without penalty. Cancel from Settings within 10 days of purchase to exercise this right.</p>
          </Section>

          <Section title="7. How to Request a Refund">
            <p><strong>Email:</strong> info@allyapp.one<br />
            <strong>Subject:</strong> Refund Request — [your registered phone number]</p>
            <p className="mt-3">Include the date of purchase and reason. We respond within 5 business days. You may also contact Paddle directly at paddle.com/support as the Merchant of Record.</p>
          </Section>

          <Section title="8. Contact">
            <p><strong>Email:</strong> info@allyapp.one<br />
            <strong>Ally, Inc.</strong> · 1328 Botetourt Gardens, Norfolk, VA 23517, USA</p>
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
