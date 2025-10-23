"use client";
import React, { useMemo, useState } from "react";

// Next.js App Router ready: save as app/page.tsx
// Tailwind suggested. No external UI libs.
export default function PayoutEligibilityChecker() {
  // ======== Inputs ========
  const [hasActivePAs, setHasActivePAs] = useState<"yes" | "no" | "">("");
  const [inactiveReason, setInactiveReason] = useState<
    "" | "Account Blown" | "Failed Rebill" | "User Cancelled"
  >("");

  const [accountSize, setAccountSize] = useState<string>("");
  const [payoutNumber, setPayoutNumber] = useState<number | "">(""); // 1..∞
  const [lastPayoutStatus, setLastPayoutStatus] = useState<
    "none" | "approved" | "denied"
  >("none");
  const [tradingDaysSinceRuleDate, setTradingDaysSinceRuleDate] = useState<
    number | ""
  >("");
  const [profitDaysOver50, setProfitDaysOver50] = useState<number | "">("");
  const [largestSingleDayProfit, setLargestSingleDayProfit] = useState<
    number | ""
  >("");

  // Money fields
  const [currentBalance, setCurrentBalance] = useState<number | "">("");
  const [requestedPayout, setRequestedPayout] = useState<number | "">("");

  // ======== Policy tables (edit if Apex updates) ========
  type AS =
    | "25K"
    | "50K"
    | "100K"
    | "150K"
    | "250K"
    | "300K"
    | "100K Static";

  const STARTING_BALANCE: Record<AS, number> = {
    "25K": 25000,
    "50K": 50000,
    "100K": 100000,
    "150K": 150000,
    "250K": 250000,
    "300K": 300000,
    "100K Static": 100000,
  };

  // From "Minimum Required Balance" table: min balance = start + drawdown + 100
  const MIN_REQUIRED_BALANCE: Record<AS, number> = {
    "25K": 26600,
    "50K": 52600,
    "100K": 103100,
    "150K": 155100,
    "250K": 256600,
    "300K": 307600,
    "100K Static": 102600,
  };

  // Compute implied trailing drawdown per size (from min table)
  const DRAWDOWN: Record<AS, number> = Object.fromEntries(
    (Object.keys(STARTING_BALANCE) as AS[]).map((k) => [
      k,
      MIN_REQUIRED_BALANCE[k] - STARTING_BALANCE[k] - 100,
    ])
  ) as Record<AS, number>;

  // Max payout caps for first five payouts
  const MAX_PAYOUT_FIRST_FIVE: Record<AS, number> = {
    "25K": 1500,
    "50K": 2000,
    "100K": 2500,
    "150K": 2750,
    "250K": 3000,
    "300K": 3500,
    "100K Static": 1000,
  };

  // Account notes area if you want to show per-size tips
  const accountInfo: Record<string, string> = {
    "": "",
    "25K": "Min bal 26,600. DD ≈ 1,500. First three payouts require safety net.",
    "50K": "Min bal 52,600. DD ≈ 2,500. 30% consistency until 6th payout.",
    "100K": "Min bal 103,100. DD ≈ 3,000.",
    "150K": "Min bal 155,100. DD ≈ 5,000.",
    "250K": "Min bal 256,600. DD ≈ 6,500.",
    "300K": "Min bal 307,600. DD ≈ 7,500.",
    "100K Static": "Min bal 102,600. DD ≈ 2,500. Max (first five) $1,000.",
  };

  // ======== Derived values ========
  const start = (STARTING_BALANCE as any)[accountSize] as number | undefined;
  const minBalance = (MIN_REQUIRED_BALANCE as any)[accountSize] as
    | number
    | undefined;
  const dd = (DRAWDOWN as any)[accountSize] as number | undefined;
  const safetyNet = typeof dd === "number" ? dd + 100 : NaN; // applies to payouts 1-3
  const maxCap = (MAX_PAYOUT_FIRST_FIVE as any)[accountSize] as
    | number
    | undefined;

  const overallProfit = useMemo(() => {
    const bal = typeof currentBalance === "number" ? currentBalance : NaN;
    if (!start || !Number.isFinite(bal)) return NaN;
    return bal - start;
  }, [currentBalance, start]);

  // ======== Core rule checks ========
  const checks = useMemo(() => {
    const reasons: string[] = [];

    // Active PA(s)
    if (hasActivePAs === "no") {
      reasons.push(
        inactiveReason
          ? `No active PAs (Reason: ${inactiveReason}).`
          : "No active PAs."
      );
      return { eligible: false, reasons };
    }
    if (hasActivePAs !== "yes") {
      reasons.push("Select whether user has active PAs.");
      return { eligible: false, reasons };
    }

    // Validate key numeric inputs
    const pn = typeof payoutNumber === "number" ? payoutNumber : NaN;
    const td = typeof tradingDaysSinceRuleDate === "number" ? tradingDaysSinceRuleDate : NaN;
    const pd50 = typeof profitDaysOver50 === "number" ? profitDaysOver50 : NaN;
    const ldp = typeof largestSingleDayProfit === "number" ? largestSingleDayProfit : NaN;
    const bal = typeof currentBalance === "number" ? currentBalance : NaN;
    const req = typeof requestedPayout === "number" ? requestedPayout : NaN;

    if (!Number.isFinite(pn) || pn < 1) reasons.push("Select a valid payout number.");

    // 8 trading days + 5 profit days ≥ $50
    if (!Number.isFinite(td) || td < 8) reasons.push("Must have at least 8 trading days.");
    if (!Number.isFinite(pd50) || pd50 < 5) reasons.push("Needs 5 profit days over $50.");

    // Minimum payout $500 (all sizes, all payouts)
    if (!Number.isFinite(req) || req < 500) reasons.push("Minimum payout request is $500.");

    // Required minimum balance (always)
    if (!start || !minBalance || !Number.isFinite(bal) || bal < minBalance) {
      reasons.push("Current balance must be at or above the required minimum for this account size.");
    }

    // 30% consistency applies until 6th payout
    if (Number.isFinite(ldp)) {
      if (Number.isFinite(overallProfit) && overallProfit > 0) {
        if (Number.isFinite(pn) && pn <= 5) {
          const ratio = ldp / overallProfit;
          if (ratio > 0.3) {
            const needed = (ldp / 0.3).toFixed(2);
            reasons.push(`30% consistency: need at least $${needed} total profit given a $${ldp.toFixed(2)} max day.`);
          }
        }
      } else {
        reasons.push("Provide current balance so overall profit can be calculated for the 30% rule.");
      }
    } else {
      reasons.push("Enter largest single-day profit to check the 30% rule.");
    }

    // First three payouts: safety-net math (can encroach by $500, more requires extra headroom)
    if (Number.isFinite(pn) && pn <= 3 && Number.isFinite(bal) && start && !Number.isNaN(safetyNet)) {
      const postBal = Number.isFinite(req) ? bal - req : NaN;
      const baseline = start + safetyNet; // typical threshold
      const encroachFloor = baseline - 500; // up to $500 encroachment allowed for the min $500

      if (Number.isFinite(req)) {
        if (req === 500) {
          if (!Number.isFinite(postBal) || postBal < encroachFloor) {
            reasons.push("For first three payouts, requesting $500 still requires post-payout balance ≥ safety net minus $500.");
          }
        } else if (req > 500) {
          // Need extra headroom equal to (req - 500)
          const requiredBal = baseline + (req - 500);
          if (bal < requiredBal) {
            reasons.push(
              `For first three payouts, requesting $${req.toFixed(
                2
              )} requires balance ≥ $${requiredBal.toFixed(2)} (safety net + amount over $500).`
            );
          }
        }
      }
    }

    // Max payout caps on first five payouts
    if (Number.isFinite(pn) && pn <= 5 && Number.isFinite(req) && maxCap && req > maxCap) {
      reasons.push(`Max payout for ${accountSize} (first five) is $${maxCap.toFixed(0)}.`);
    }

    const eligible = reasons.length === 0;
    return { eligible, reasons };
  }, [
    hasActivePAs,
    inactiveReason,
    accountSize,
    payoutNumber,
    tradingDaysSinceRuleDate,
    profitDaysOver50,
    largestSingleDayProfit,
    currentBalance,
    requestedPayout,
    overallProfit,
    minBalance,
    start,
    safetyNet,
    maxCap,
  ]);

  // ======== UI helpers ========
  const Badge = ({ ok }: { ok: boolean }) => (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      }`}
    >
      {ok ? "OK" : "Needs attention"}
    </span>
  );

  const RuleRow: React.FC<{ label: string; ok: boolean | null; hint?: string }> = ({
    label,
    ok,
    hint,
  }) => (
    <div className="flex items-start justify-between py-2 border-b last:border-b-0">
      <div className="pr-3">
        <div className="font-medium text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </div>
      <div>{ok === null ? <span className="text-xs">—</span> : <Badge ok={ok} />}</div>
    </div>
  );

  // convenience locals for checklist
  const pn = typeof payoutNumber === "number" ? payoutNumber : NaN;
  const td = typeof tradingDaysSinceRuleDate === "number" ? tradingDaysSinceRuleDate : NaN;
  const pd50 = typeof profitDaysOver50 === "number" ? profitDaysOver50 : NaN;
  const ldp = typeof largestSingleDayProfit === "number" ? largestSingleDayProfit : NaN;
  const bal = typeof currentBalance === "number" ? currentBalance : NaN;
  const req = typeof requestedPayout === "number" ? requestedPayout : NaN;

  const eightDaysOk = Number.isFinite(td) ? td >= 8 : false;
  const fiveProfitDaysOk = Number.isFinite(pd50) ? pd50 >= 5 : false;
  const minBalanceOk = start && minBalance && Number.isFinite(bal) ? bal >= minBalance : false;
  const thirtyPercentOk = Number.isFinite(ldp) && Number.isFinite(overallProfit) && overallProfit > 0
    ? (Number.isFinite(pn) && pn <= 5 ? ldp / overallProfit <= 0.3 : true)
    : false;

  const safetyNetBoxesNeeded = Number.isFinite(pn) && pn <= 3;
  const encroachFloor = start && safetyNet ? start + safetyNet - 500 : NaN;
  const postBal = Number.isFinite(bal) && Number.isFinite(req) ? bal - req : NaN;
  const safetyNetOk = safetyNetBoxesNeeded
    ? (Number.isFinite(req) && req > 500
        ? Number.isFinite(bal) && Number.isFinite(start) && Number.isFinite(safetyNet)
          ? bal >= (start as number) + (safetyNet as number) + (req - 500)
          : false
        : Number.isFinite(postBal) && Number.isFinite(encroachFloor)
          ? postBal >= (encroachFloor as number)
          : false)
    : null;

  const minRequestOk = Number.isFinite(req) ? req >= 500 : false;

  const guidanceNote = useMemo(() => {
    if (!Number.isFinite(pn)) return "";
    if (pn <= 3) return "First three payouts: safety net applies (drawdown + $100). $500 min can encroach safety net by up to $500.";
    if (pn === 4 || pn === 5) return "4th–5th payouts: no safety net requirement, but caps still apply by account size.";
    if (pn >= 6) return "6th payout and beyond: no cap; 100% of profits may be withdrawn as long as the minimum balance remains after payout.";
    return "";
  }, [payoutNumber]);

  const summaryLines = useMemo(() => {
    if (hasActivePAs === "no") {
      return [
        `Should user get a payout? → NO`,
        inactiveReason ? `Reason: ${inactiveReason}` : "Reason: Inactive PA(s)",
      ];
    }

    if (checks.eligible) return ["Should user get a payout? → YES"];

    return ["Should user get a payout? → NO", ...checks.reasons.map((r) => `• ${r}`)];
  }, [checks.eligible, checks.reasons, hasActivePAs, inactiveReason]);

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Payout Eligibility Checker</h1>
          <p className="text-sm text-neutral-600 mt-2">
            Uses Apex rules: minimum balances by size, safety net for first three payouts, 30% consistency until sixth, and payout caps through the fifth.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border p-4 md:p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm">
                <strong>Step 1 — Pull up user in aMember.</strong> Verify active PA(s), payout count, prior payout status, and trading-day metrics.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Account Size</label>
                  <select
                    className="w-full rounded-xl border p-2"
                    value={accountSize}
                    onChange={(e) => setAccountSize(e.target.value)}
                  >
                    <option value="">Select…</option>
                    <option>25K</option>
                    <option>50K</option>
                    <option>100K</option>
                    <option>150K</option>
                    <option>250K</option>
                    <option>300K</option>
                    <option>100K Static</option>
                  </select>
                  {accountInfo[accountSize] && (
                    <p className="text-xs text-neutral-600 mt-1">{accountInfo[accountSize]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Does the user have active PA(s)?</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setHasActivePAs("yes")}
                      className={`px-3 py-2 rounded-xl border ${
                        hasActivePAs === "yes" ? "bg-emerald-600 text-white border-emerald-700" : "bg-white"
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasActivePAs("no")}
                      className={`px-3 py-2 rounded-xl border ${
                        hasActivePAs === "no" ? "bg-rose-600 text-white border-rose-700" : "bg-white"
                      }`}
                    >
                      No
                    </button>
                  </div>
                  {hasActivePAs === "no" && (
                    <div className="mt-2">
                      <label className="block text-sm mb-1">Reason</label>
                      <select
                        className="w-full rounded-xl border p-2"
                        value={inactiveReason}
                        onChange={(e) => setInactiveReason(e.target.value as any)}
                      >
                        <option value="">Select…</option>
                        <option>Account Blown</option>
                        <option>Failed Rebill</option>
                        <option>User Cancelled</option>
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Payout Number</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g., 1 for first, 2 for second…"
                    className="w-full rounded-xl border p-2"
                    value={payoutNumber as any}
                    onChange={(e) => setPayoutNumber(e.target.value === "" ? "" : parseInt(e.target.value))}
                  />
                  {guidanceNote && <div className="text-xs text-neutral-600 mt-1">{guidanceNote}</div>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Last Payout Status</label>
                  <select
                    className="w-full rounded-xl border p-2"
                    value={lastPayoutStatus}
                    onChange={(e) => setLastPayoutStatus(e.target.value as any)}
                  >
                    <option value="none">None yet</option>
                    <option value="approved">Approved</option>
                    <option value="denied">Denied</option>
                  </select>
                  <p className="text-[11px] text-neutral-600 mt-1">
                    If the last payout was <strong>approved</strong>, trading days count starts from the <em>day following</em> the approval date. If it was <strong>denied</strong>, all days before the last approved payout count toward this request.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Trading days since rule date</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-xl border p-2"
                    value={tradingDaysSinceRuleDate as any}
                    onChange={(e) => setTradingDaysSinceRuleDate(e.target.value === "" ? "" : parseInt(e.target.value))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1"># of profit days over $50</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-xl border p-2"
                    value={profitDaysOver50 as any}
                    onChange={(e) => setProfitDaysOver50(e.target.value === "" ? "" : parseInt(e.target.value))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Largest single-day profit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-xl border p-2"
                    value={largestSingleDayProfit as any}
                    onChange={(e) => setLargestSingleDayProfit(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  />
                  <p className="text-[11px] text-neutral-600 mt-1">30% rule applies until the 6th payout.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Current balance ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-xl border p-2"
                    value={currentBalance as any}
                    onChange={(e) => setCurrentBalance(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  />
                  {Number.isFinite(overallProfit) && (
                    <p className="text-[11px] text-neutral-600 mt-1">Calculated overall profit: ${Number(overallProfit).toFixed(2)}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Requested payout amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-xl border p-2"
                    value={requestedPayout as any}
                    onChange={(e) => setRequestedPayout(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  />
                  <p className="text-[11px] text-neutral-600 mt-1">Minimum request $500. {Number.isFinite(pn) && pn <= 5 && maxCap ? `Max (first five) $${maxCap}.` : null}</p>
                </div>
              </div>

              {accountSize && (
                <div className="text-xs text-neutral-700 bg-neutral-50 border rounded-xl p-3 mt-2">
                  <div><strong>Size:</strong> {accountSize}</div>
                  <div><strong>Starting balance:</strong> ${start?.toLocaleString()}</div>
                  <div><strong>Required minimum balance:</strong> ${minBalance?.toLocaleString()}</div>
                  <div><strong>Drawdown:</strong> ${dd?.toLocaleString()} &nbsp; <span className="text-neutral-500">(safety net = drawdown + $100 → ${Number.isFinite(safetyNet) ? (safetyNet as number).toLocaleString() : "—"})</span></div>
                </div>
              )}
            </div>
          </section>

          <aside className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border p-4 md:p-6 space-y-4">
              <h2 className="text-lg font-semibold">Checklist</h2>

              <div className="space-y-2">
                <RuleRow label="Active PA(s) present" ok={hasActivePAs === "yes"} />
                <RuleRow label="At least 8 trading days" ok={Number.isFinite(td) ? eightDaysOk : false} />
                <RuleRow label="≥ 5 profit days over $50" ok={Number.isFinite(pd50) ? fiveProfitDaysOk : false} />
                <RuleRow label="Meets required minimum balance" ok={minBalanceOk} />
                <RuleRow label={pn <= 5 ? "30% consistency ≤ 30% of profit" : "30% rule not required (6th+)"} ok={thirtyPercentOk} />
                <RuleRow label="Safety net logic satisfied (payouts 1–3)" ok={safetyNetBoxesNeeded ? !!safetyNetOk : null} />
                <RuleRow label="Minimum request $500" ok={minRequestOk} />
              </div>

              {guidanceNote && (
                <div className="bg-neutral-50 border rounded-xl p-3 text-xs text-neutral-700">{guidanceNote}</div>
              )}

              <div className="pt-3">
                <h3 className="font-semibold mb-2">Decision</h3>
                <div
                  className={`rounded-xl p-3 text-sm font-medium ${
                    checks.eligible ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-800"
                  }`}
                >
                  {summaryLines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>

              {!checks.eligible && hasActivePAs === "yes" && (
                <div className="pt-2">
                  <h4 className="font-semibold text-sm mb-1">What to fix</h4>
                  <ul className="list-disc list-inside text-sm text-neutral-800 space-y-1">
                    {checks.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={() => window.print()} className="w-full mt-3 rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">Print / Save as PDF</button>
            </div>

            <div className="mt-4 text-xs text-neutral-600">
              <p className="mb-2 font-semibold">Notes</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Safety net applies to the first three payouts only (drawdown + $100). $500 min can encroach the safety net by up to $500; larger amounts need extra headroom equal to the excess over $500.</li>
                <li>30% consistency rule applies through the 5th payout. It resets after each approved payout.</li>
                <li>First five payouts have size-based caps; 6th+ no cap and 100% of profits may be withdrawn if the minimum balance remains after the payout.</li>
              </ul>
            </div>
          </aside>
        </div>

        <footer className="mt-10 text-[11px] text-neutral-500">Paste into <code>app/page.tsx</code>, commit to GitHub, deploy on Vercel.</footer>
      </div>
    </main>
  );
}
