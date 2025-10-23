"use client";
import React, { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";

// ---
// Apex PA Payout Checker (Next.js App Router compatible)
// Drop in as app/page.tsx. Tailwind recommended.
// ---

type AccountKey =
  | "25k"
  | "50k"
  | "100k"
  | "150k"
  | "250k"
  | "300k"
  | "100kStatic";

type PAStatus = "Active" | "Account Blown" | "Failed Rebill" | "User Cancelled";

const ACCOUNT_CONFIG: Record<
  AccountKey,
  { label: string; startBalance: number; minReqBalanceFirst3: number }
> = {
  "25k": { label: "$25k", startBalance: 25000, minReqBalanceFirst3: 26600 },
  "50k": { label: "$50k", startBalance: 50000, minReqBalanceFirst3: 52600 },
  "100k": { label: "$100k", startBalance: 100000, minReqBalanceFirst3: 103100 },
  "150k": { label: "$150k", startBalance: 150000, minReqBalanceFirst3: 155100 },
  "250k": { label: "$250k", startBalance: 250000, minReqBalanceFirst3: 256600 },
  "300k": { label: "$300k", startBalance: 300000, minReqBalanceFirst3: 307600 },
  "100kStatic": { label: "$100k Static", startBalance: 100000, minReqBalanceFirst3: 102600 },
};

// Max payout caps (first five payouts)
const MAX_PAYOUT_FIRST_FIVE: Partial<Record<AccountKey, number>> = {
  "25k": 1500,
  "50k": 2000,
  "100k": 2500,
  "150k": 2750,
  "250k": 3000,
  "300k": 3500,
  "100kStatic": 1000,
};

// Utils
function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function toNumber(s: string): number {
  const v = Number((s || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(v) ? v : 0;
}

// Core logic
export type Inputs = {
  paStatus: PAStatus;
  account: AccountKey;
  payoutNumber: number; // 1-based
  isLiveProp: boolean; // if true, 30% rule lifted

  currentBalance: number; // current PA balance
  highestProfitDaySinceRef: number; // highest SINGLE day profit since ref period

  tradingDaysSinceRef: number; // trading days since last APPROVED payout (or since start if none)
  profitableDaysOver50SinceRef: number; // days with >= $50 profit in the same period

  requestedPayout: number; // requested payout amount
  // Optional accuracy: supply balance right after last APPROVED payout (else we use start balance)
  lastApprovedPayoutBalance?: number | null;
};

export type Verdict = {
  eligible: boolean;
  reasons: Array<{ pass: boolean; label: string; detail?: string }>;
  advice: string[];
  computed: {
    safetyNetRequired: boolean;
    safetyNetAmount: number;
    minBalanceToRequest: number;
    minPayout: number;
    maxPayoutCap: number | null;
    mustLeaveAfterPayout: number;
    payoutRangeAllowed: { min: number; max: number } | null;
  };
};

export function evaluate(inputs: Inputs): Verdict {
  const cfg = ACCOUNT_CONFIG[inputs.account];
  const payoutNum = clamp(Math.floor(inputs.payoutNumber || 0), 1, 99);
  const minPayout = 500;

  // Safety net is drawdown + $100 (first 3 payouts)
  const safetyNetRequired = !inputs.isLiveProp && payoutNum <= 3;
  const safetyNetAmount = cfg.minReqBalanceFirst3 - cfg.startBalance;

  // Minimum balance to request
  const minBalanceToRequest = safetyNetRequired
    ? cfg.minReqBalanceFirst3
    : cfg.startBalance + 100; // trailing DD stops at start+100; safety net lifted ≥4th or Live Prop

  // 30% rule applies until the 6th payout OR Live Prop
  const windfallRuleApplies = !inputs.isLiveProp && payoutNum < 6;
  const baseline = inputs.lastApprovedPayoutBalance ?? cfg.startBalance;
  const totalProfit = Math.max(0, inputs.currentBalance - baseline);
  const windfallPass = !windfallRuleApplies
    ? true
    : totalProfit === 0
    ? false
    : inputs.highestProfitDaySinceRef / totalProfit <= 0.3;

  // Day requirements
  const eightDaysPass = inputs.tradingDaysSinceRef >= 8;
  const fiveDays50Pass = inputs.profitableDaysOver50SinceRef >= 5;

  // Caps first five
  const maxPayoutCap = payoutNum <= 5 ? MAX_PAYOUT_FIRST_FIVE[inputs.account] ?? null : null;

  // Balance checks
  const meetsMinBalance = inputs.currentBalance >= minBalanceToRequest;
  const canLeaveMinAfter = inputs.currentBalance - inputs.requestedPayout >= minBalanceToRequest;
  const meetsMinRequest = inputs.requestedPayout >= minPayout;
  const underMaxCap = maxPayoutCap == null ? true : inputs.requestedPayout <= maxPayoutCap;

  // Safety net nuance (first 3 payouts)
  let safetyNetEncroachmentOK = true;
  if (safetyNetRequired) {
    const overage = Math.max(0, inputs.requestedPayout - minPayout);
    const mustHave = cfg.minReqBalanceFirst3 + overage;
    safetyNetEncroachmentOK =
      inputs.requestedPayout === minPayout
        ? inputs.currentBalance >= cfg.minReqBalanceFirst3
        : inputs.currentBalance >= mustHave;
  }

  const paActive = inputs.paStatus === "Active";

  const reasons: Verdict["reasons"] = [
    {
      pass: paActive,
      label: "Performance Account is active",
      detail: paActive ? "Account is in good standing." : `Status: ${inputs.paStatus}`,
    },
    {
      pass: eightDaysPass,
      label: "≥ 8 trading days since last APPROVED payout (or start)",
      detail: `You have ${inputs.tradingDaysSinceRef} day(s).`,
    },
    {
      pass: fiveDays50Pass,
      label: "≥ 5 days with ≥ $50 profit (in the same period)",
      detail: `You have ${inputs.profitableDaysOver50SinceRef} day(s).`,
    },
    {
      pass: windfallPass,
      label: windfallRuleApplies
        ? "30% consistency rule met (no single day > 30% of total profit)"
        : "30% rule not in effect (≥ 6th payout or Live Prop)",
      detail: windfallRuleApplies
        ? `Highest day: $${fmt(inputs.highestProfitDaySinceRef)} | Total profit: $${fmt(totalProfit)} | Ratio: ${(
            (inputs.highestProfitDaySinceRef / Math.max(1, totalProfit)) * 100
          ).toFixed(1)}%`
        : undefined,
    },
    {
      pass: meetsMinBalance,
      label: safetyNetRequired
        ? `Meets safety net balance (≥ $${fmt(minBalanceToRequest)})`
        : `Meets trailing DD stop balance (≥ $${fmt(minBalanceToRequest)})`,
      detail: `Current balance: $${fmt(inputs.currentBalance)}`,
    },
    { pass: meetsMinRequest, label: `Requested payout ≥ $${fmt(minPayout)}` },
    {
      pass: underMaxCap,
      label:
        maxPayoutCap == null
          ? "No max payout cap (≥ 6th payout)"
          : `Under max payout cap for this account & payout # (≤ $${fmt(maxPayoutCap)})`,
    },
    {
      pass: safetyNetRequired ? safetyNetEncroachmentOK : canLeaveMinAfter,
      label: safetyNetRequired
        ? inputs.requestedPayout === minPayout
          ? "Min $500 allowed even if ending encroaches safety net by $500"
          : "Balance exceeds safety net by amount over $500 requested"
        : "Sufficient balance remains after payout (≥ trailing stop)",
      detail: safetyNetRequired
        ? inputs.requestedPayout === minPayout
          ? `Need ≥ $${fmt(minBalanceToRequest)} before request. Ending can be as low as $${fmt(
              minBalanceToRequest - 500
            )}.`
          : `For request of $${fmt(inputs.requestedPayout)}, need balance ≥ $${fmt(
              minBalanceToRequest + Math.max(0, inputs.requestedPayout - 500)
            )}.`
        : `Post-payout balance would be $${fmt(
            inputs.currentBalance - inputs.requestedPayout
          )}. Must be ≥ $${fmt(minBalanceToRequest)}.`,
    },
  ];

  const eligible = reasons.every((r) => r.pass);

  // Allowed payout range if eligible
  let allowedRange: Verdict["computed"]["payoutRangeAllowed"] = null;
  if (eligible) {
    const minAllowed = minPayout;
    let byBalance =
      safetyNetRequired
        ? Math.max(500, 500 + Math.max(0, inputs.currentBalance - minBalanceToRequest))
        : inputs.currentBalance - minBalanceToRequest;
    let maxAllowed = Math.floor(byBalance);
    if (maxPayoutCap != null) maxAllowed = Math.min(maxAllowed, maxPayoutCap);
    if (maxAllowed >= minAllowed) allowedRange = { min: minAllowed, max: maxAllowed };
  }

  const advice: string[] = [];
  if (!eightDaysPass) advice.push("Trade more days until you hit 8 since the last approved payout.");
  if (!fiveDays50Pass) advice.push("You need at least 5 days with ≥ $50 profit in the same period.");
  if (!windfallPass && windfallRuleApplies)
    advice.push(
      `Your highest day ($${fmt(
        inputs.highestProfitDaySinceRef
      )}) is >30% of total profit ($${fmt(
        totalProfit
      )}). Keep trading until total profit is at least $${fmt(
        Math.ceil(inputs.highestProfitDaySinceRef / 0.3)
      )}.`
    );
  if (!meetsMinBalance)
    advice.push(
      safetyNetRequired
        ? `Build balance to at least $${fmt(minBalanceToRequest)} to satisfy the safety net.`
        : `Build balance to at least $${fmt(minBalanceToRequest)} (trailing DD stop).`
    );
  if (!underMaxCap && maxPayoutCap != null)
    advice.push(`Requested payout exceeds the max cap of $${fmt(maxPayoutCap)} for this payout number.`);

  return {
    eligible,
    reasons,
    advice,
    computed: {
      safetyNetRequired,
      safetyNetAmount,
      minBalanceToRequest,
      minPayout,
      maxPayoutCap: maxPayoutCap ?? null,
      mustLeaveAfterPayout: minBalanceToRequest,
      payoutRangeAllowed: allowedRange,
    },
  };
}

// --- Simple runtime tests (dev aid) ---
function runInternalTests() {
  const cases: Array<{ name: string; input: Inputs; expectEligible: boolean }> = [
    {
      name: "50k, 2nd payout, min met, windfall ok, days ok → YES",
      input: {
        paStatus: "Active",
        account: "50k",
        payoutNumber: 2,
        isLiveProp: false,
        currentBalance: 52600,
        highestProfitDaySinceRef: 600,
        tradingDaysSinceRef: 8,
        profitableDaysOver50SinceRef: 5,
        requestedPayout: 500,
      },
      expectEligible: true,
    },
    {
      name: "50k, 2nd payout, windfall violation (>30%) → NO",
      input: {
        paStatus: "Active",
        account: "50k",
        payoutNumber: 2,
        isLiveProp: false,
        currentBalance: 54000,
        highestProfitDaySinceRef: 1600, // 4k profit → 40%
        tradingDaysSinceRef: 8,
        profitableDaysOver50SinceRef: 5,
        requestedPayout: 500,
      },
      expectEligible: false,
    },
    {
      name: "50k, 1st payout, only 6 days → NO",
      input: {
        paStatus: "Active",
        account: "50k",
        payoutNumber: 1,
        isLiveProp: false,
        currentBalance: 53000,
        highestProfitDaySinceRef: 600,
        tradingDaysSinceRef: 6,
        profitableDaysOver50SinceRef: 4,
        requestedPayout: 500,
      },
      expectEligible: false,
    },
    {
      name: "50k, 4th payout, safety net lifted, leave ≥ start+100 → YES",
      input: {
        paStatus: "Active",
        account: "50k",
        payoutNumber: 4,
        isLiveProp: false,
        currentBalance: 53100,
        highestProfitDaySinceRef: 200,
        tradingDaysSinceRef: 10,
        profitableDaysOver50SinceRef: 6,
        requestedPayout: 1000,
      },
      expectEligible: true,
    },
    {
      name: "50k, 2nd payout, over the max cap → NO",
      input: {
        paStatus: "Active",
        account: "50k",
        payoutNumber: 2,
        isLiveProp: false,
        currentBalance: 56000,
        highestProfitDaySinceRef: 600,
        tradingDaysSinceRef: 12,
        profitableDaysOver50SinceRef: 8,
        requestedPayout: 2500, // cap is 2000
      },
      expectEligible: false,
    },
    {
      name: "50k, 6th payout, no cap and no 30% rule → YES",
      input: {
        paStatus: "Active",
        account: "50k",
        payoutNumber: 6,
        isLiveProp: false,
        currentBalance: 60000,
        highestProfitDaySinceRef: 5000, // would fail <6th, passes here
        tradingDaysSinceRef: 16,
        profitableDaysOver50SinceRef: 10,
        requestedPayout: 8000,
      },
      expectEligible: true,
    },
  ];

  return cases.map((c) => {
    const out = evaluate(c.input);
    const pass = out.eligible === c.expectEligible;
    return { name: c.name, pass };
  });
}

// --- UI COMPONENT ---
export default function Page() {
  // Dropdown defaults; numeric inputs blank by default
  const [paStatus, setPaStatus] = useState<PAStatus>("Active");
  const [account, setAccount] = useState<AccountKey>("50k");
  const [payoutNumber, setPayoutNumber] = useState<string>("");
  const [isLiveProp, setIsLiveProp] = useState(false);

  const [currentBalance, setCurrentBalance] = useState<string>("");
  const [highestProfitDaySinceRef, setHighestProfitDaySinceRef] = useState<string>("");
  const [tradingDaysSinceRef, setTradingDaysSinceRef] = useState<string>("");
  const [profitableDaysOver50SinceRef, setProfitableDaysOver50SinceRef] = useState<string>("");
  const [requestedPayout, setRequestedPayout] = useState<string>("");

  const inputs: Inputs = useMemo(
    () => ({
      paStatus,
      account,
      payoutNumber: Math.max(1, Math.floor(toNumber(payoutNumber))),
      isLiveProp,
      currentBalance: toNumber(currentBalance),
      highestProfitDaySinceRef: toNumber(highestProfitDaySinceRef),
      tradingDaysSinceRef: Math.max(0, Math.floor(toNumber(tradingDaysSinceRef))),
      profitableDaysOver50SinceRef: Math.max(0, Math.floor(toNumber(profitableDaysOver50SinceRef))),
      requestedPayout: toNumber(requestedPayout),
    }),
    [
      paStatus,
      account,
      payoutNumber,
      isLiveProp,
      currentBalance,
      highestProfitDaySinceRef,
      tradingDaysSinceRef,
      profitableDaysOver50SinceRef,
      requestedPayout,
    ]
  );

  const verdict = useMemo(() => evaluate(inputs), [inputs]);
  const tests = useMemo(() => runInternalTests(), []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-gray-900 dark:text-gray-100">
      <header className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-gray-100 dark:bg-gray-800 p-3">
          <Info className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Apex PA Payout Checker</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Quickly validate payout eligibility per account and payout number. All logic is client-side.
          </p>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        {/* LEFT: Inputs */}
        <div className="md:col-span-2">
          <div className="grid gap-4 rounded-2xl border p-4 shadow-sm bg-white dark:bg-neutral-900 dark:border-gray-700">
            <h2 className="text-lg font-medium">Inputs</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">PA Status</label>
                <select
                  className="w-full rounded-xl border p-2 bg-white dark:bg-neutral-900 dark:border-gray-700 dark:text-gray-100"
                  value={paStatus}
                  onChange={(e) => setPaStatus(e.target.value as PAStatus)}
                >
                  {(["Active", "Account Blown", "Failed Rebill", "User Cancelled"] as PAStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Account Size</label>
                <select
                  className="w-full rounded-xl border p-2 bg-white dark:bg-neutral-900 dark:border-gray-700 dark:text-gray-100"
                  value={account}
                  onChange={(e) => setAccount(e.target.value as AccountKey)}
                >
                  {Object.entries(ACCOUNT_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Payout Number</label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g., 2"
                  className="w-full rounded-xl border p-2 bg-white dark:bg-neutral-900 dark:border-gray-700 dark:text-gray-100"
                  value={payoutNumber}
                  onChange={(e) => setPayoutNumber(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">1st, 2nd, 3rd… (6th removes 30% rule and caps)</p>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  id="isLiveProp"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isLiveProp}
                  onChange={(e) => setIsLiveProp(e.target.checked)}
                />
                <label htmlFor="isLiveProp" className="text-sm">
                  Live Prop Account (lifts 30% rule)
                </label>
              </div>
            </div>

            <hr className="dark:border-gray-700" />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Current Balance ($)</label>
                <input
                  inputMode="decimal"
                  placeholder="e.g., 52600"
                  className="w-full rounded-xl border p-2 bg-white dark:bg-neutral-900 dark:border-gray-700 dark:text-gray-100"
                  value={currentBalance}
                  onChange={(e) => setCurrentBalance(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Requested Payout ($)</label>
                <input
                  inputMode="decimal"
                  placeholder="e.g., 500"
                  className="w-full rounded-xl border p-2 bg-white dark:bg-neutral-900 dark:border-gray-700 dark:text-gray-100"
                  value={requestedPayout}
                  onChange={(e) => setRequestedPayout(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Min $500. Caps apply for first 5 payouts.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Highest Profit Day Since Ref ($)</label>
                <input
                  inputMode="decimal"
                  placeholder="e.g., 600"
                  className="w-full rounded-xl border p-2 bg-white dark:bg-neutral-900 dark:border-gray-700 dark:text-gray-100"
                  value={highestProfitDaySinceRef}
                  onChange={(e) => setHighestProfitDaySinceRef(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Trading Days Since Ref</label>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g., 8"
                  className="w-full rounded-xl border p-2 bg-white dark:bg-neutral-900 dark:border-gray-700 dark:text-gray-100"
                  value={tradingDaysSinceRef}
                  onChange={(e) => setTradingDaysSinceRef(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Profitable Days ≥ $50</label>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g., 5"
                  className="w-full rounded-xl border p-2 bg-white dark:bg-neutral-900 dark:border-gray-700 dark:text-gray-100"
                  value={profitableDaysOver50SinceRef}
                  onChange={(e) => setProfitableDaysOver50SinceRef(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Summary */}
        <aside className="grid gap-4">
          <div
            className={`rounded-2xl border p-4 shadow-sm bg-white dark:bg-neutral-900 ${verdict.eligible ? "border-emerald-400" : "border-rose-300"}`}
          >
            <div className="mb-2 flex items-center gap-2">
              {verdict.eligible ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
              <h2 className="text-lg font-semibold">Should user get a payout?</h2>
            </div>
            <p className={`text-xl font-bold ${verdict.eligible ? "text-emerald-600" : "text-rose-600"}`}>
              {verdict.eligible ? "YES" : "NO"}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <div className="text-gray-500 dark:text-gray-400">Safety net required?</div>
                <div className="font-medium">{verdict.computed.safetyNetRequired ? "Yes (first 3)" : "No"}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Safety net = drawdown + $100 → ${fmt(verdict.computed.safetyNetAmount)}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <div className="text-gray-500 dark:text-gray-400">Min balance to request</div>
                <div className="font-medium">${fmt(verdict.computed.minBalanceToRequest)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Must remain after payout (≥4th) or be met before request (≤3rd).
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <div className="text-gray-500 dark:text-gray-400">Min payout</div>
                <div className="font-medium">${fmt(verdict.computed.minPayout)}</div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <div className="text-gray-500 dark:text-gray-400">Max payout cap</div>
                <div className="font-medium">
                  {verdict.computed.maxPayoutCap ? `$${fmt(verdict.computed.maxPayoutCap)}` : "No cap (≥6th)"}
                </div>
              </div>
            </div>

            {verdict.computed.payoutRangeAllowed && (
              <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-3 text-sm">
                <div className="text-gray-600 dark:text-gray-300">Allowed payout range</div>
                <div className="text-lg font-semibold">
                  ${fmt(verdict.computed.payoutRangeAllowed.min)} – ${fmt(verdict.computed.payoutRangeAllowed.max)}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-neutral-900 dark:border-gray-700">
            <h3 className="mb-2 font-medium">Checklist</h3>
            <ul className="space-y-2">
              {verdict.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  {r.pass ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 text-rose-600" />
                  )}
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    {r.detail && <div className="text-xs text-gray-600 dark:text-gray-300">{r.detail}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {verdict.advice.length > 0 && (
            <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-neutral-900 dark:border-gray-700">
              <h3 className="mb-2 font-medium">What to fix</h3>
              <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                {verdict.advice.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Dev tests */}
          <div className="rounded-2xl border p-4 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-neutral-900 dark:border-gray-700">
            <p className="mb-2 font-medium">Internal Tests</p>
            <ul className="list-disc pl-5">
              {tests.map((t) => (
                <li key={t.name}>
                  {t.pass ? "✅" : "❌"} {t.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border p-4 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-neutral-900 dark:border-gray-700">
            <p>
              Notes: 30% rule lifted on the 6th payout or Live Prop. Safety net (drawdown + $100) applies to first three payouts only.
              Min payout is $500. First five payouts have account-size caps. After 6th, no cap but you must still satisfy the minimum
              balance rules.
            </p>
          </div>
        </aside>
      </section>

      <footer className="mt-8 text-xs text-gray-500 dark:text-gray-400">
        Built for quick operator checks. No data is sent anywhere.
      </footer>
    </div>
  );
}
