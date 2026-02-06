import { CheckmarkRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { useState } from "react";

import { Button } from "./generic/Button";

const PRO_MONTHLY_PRICE = 18;
const PRO_YEARLY_PRICE = 14;
const SAVINGS_PERCENT = Math.round(
  (1 - PRO_YEARLY_PRICE / PRO_MONTHLY_PRICE) * 100,
);

export function PricingSection() {
  const [billing, setBilling] = useState<"yearly" | "monthly">("yearly");

  return (
    <div className="flex flex-col gap-y-8">
      {/* Billing Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-3 p-1 bg-gray-100 rounded-full">
          <button
            onClick={() => setBilling("yearly")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              billing === "yearly"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Yearly
            <span className="ml-1.5 text-xs text-green-600">
              Save {SAVINGS_PERCENT}%
            </span>
          </button>
          <button
            onClick={() => setBilling("monthly")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              billing === "monthly"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* Free Tier */}
        <div className="flex flex-col gap-y-6 p-6 rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-col gap-y-1">
            <h3 className="text-xl font-medium text-gray-900">Free</h3>
            <p className="text-sm text-gray-600">Perfect for getting started</p>
          </div>
          <div className="flex items-baseline gap-x-1">
            <span className="text-4xl font-medium text-gray-900">$0</span>
            <span className="text-sm text-gray-600">forever</span>
          </div>
          <Button
            href="https://app.lydie.co/auth"
            size="lg"
            intent="secondary"
            className="w-full"
            phCapture="pricing_free_clicked"
          >
            <div className="flex items-center justify-center gap-x-1">
              <span>Get started</span>
              <ChevronRightRegular className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
            </div>
          </Button>
          <hr className="border-gray-200" />
          <div className="flex flex-col gap-y-4">
            <div>
              <span className="text-2xl font-medium text-gray-900">150</span>
              <span className="text-sm text-gray-600 ml-1">credits / month</span>
            </div>
            <ul className="flex flex-col gap-y-3">
              <li className="flex items-start gap-x-2">
                <CheckmarkRegular className="size-4 text-gray-700 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">Unlimited documents</span>
              </li>
              <li className="flex items-start gap-x-2">
                <CheckmarkRegular className="size-4 text-gray-700 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">Basic AI assistance</span>
              </li>
              <li className="flex items-start gap-x-2">
                <CheckmarkRegular className="size-4 text-gray-700 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">Community support</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Pro Tier */}
        <div className="flex flex-col gap-y-6 p-6 rounded-2xl border border-gray-800 ring-2 ring-gray-800/10 bg-gray-50/50 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="text-xs font-medium text-white bg-gray-800 px-3 py-1 rounded-full">
              Most popular
            </span>
          </div>
          <div className="flex flex-col gap-y-1">
            <h3 className="text-xl font-medium text-gray-900">Pro</h3>
            <p className="text-sm text-gray-600">For power users and teams</p>
          </div>
          <div className="flex items-baseline gap-x-1">
            <span className="text-4xl font-medium text-gray-900">
              ${billing === "yearly" ? PRO_YEARLY_PRICE : PRO_MONTHLY_PRICE}
            </span>
            <span className="text-sm text-gray-600">/ seat / month</span>
          </div>
          {billing === "yearly" ? (
            <div className="text-sm text-green-600">
              Billed annually (${PRO_YEARLY_PRICE * 12}/year)
            </div>
          ) : (
            <div className="text-sm text-gray-500">Billed monthly</div>
          )}
          <Button
            href="https://app.lydie.co/auth"
            size="lg"
            intent="primary"
            className="w-full"
            phCapture="pricing_pro_clicked"
          >
            <div className="flex items-center justify-center gap-x-1">
              <span>Get started</span>
              <ChevronRightRegular className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
            </div>
          </Button>
          <hr className="border-gray-200" />
          <div className="flex flex-col gap-y-4">
            <div>
              <span className="text-2xl font-medium text-gray-900">4,000</span>
              <span className="text-sm text-gray-600 ml-1">
                credits / month / seat
              </span>
            </div>
            <ul className="flex flex-col gap-y-3">
              <li className="flex items-start gap-x-2">
                <CheckmarkRegular className="size-4 text-gray-700 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">Everything in Free</span>
              </li>
              <li className="flex items-start gap-x-2">
                <CheckmarkRegular className="size-4 text-gray-700 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">Advanced AI features</span>
              </li>
              <li className="flex items-start gap-x-2">
                <CheckmarkRegular className="size-4 text-gray-700 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">API access</span>
              </li>
              <li className="flex items-start gap-x-2">
                <CheckmarkRegular className="size-4 text-gray-700 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">Priority support</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Credit Explanation */}
      <div className="text-center text-sm text-gray-600 mt-4">
        Credits refresh monthly. Yearly plans pay once per year but still get
        fresh credits every month.
      </div>
    </div>
  );
}
