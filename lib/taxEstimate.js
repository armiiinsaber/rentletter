// lib/taxEstimate.js
// ISOMORPHIC. Rough Canadian take-home estimate for the tenant application: gross annual
// employment income → estimated net after federal + provincial income tax, CPP and EI.
//
// ┌─────────────────────────────────────────────────────────────────────────────────────────┐
// │ ANNUAL REVIEW REQUIRED. Everything in RATES is for ONE tax year and is indexed every     │
// │ January (brackets, basic personal amounts, CPP/EI ceilings). Update TAX_YEAR + RATES     │
// │ from the CRA "Indexation adjustment" / "CPP contribution rates" / "EI premium rates"     │
// │ pages each year. Sources: canada.ca → Taxes → Tax rates; Ontario/BC ministry of finance. │
// └─────────────────────────────────────────────────────────────────────────────────────────┘
//
// This is an ESTIMATE shown to the tenant as a starting point they can overwrite. It assumes
// a single employee with only the basic personal amount (no other credits/deductions, no RRSP,
// no union dues, not self-employed CPP doubling). Self-employed applicants pay both halves of
// CPP — we deliberately keep the simple employee estimate and let them correct it.
// Scoring NEVER uses this figure (lib/scoring.js is calibrated on gross).

export const TAX_YEAR = 2026;

// Brackets are [upperBound, rate]; the last entry uses Infinity.
export const RATES = {
  federal: {
    // Lowest federal rate dropped to 14% (from 15%) effective 2026 (14.5% blended in 2025).
    brackets: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]],
    // Basic personal amount: enhanced BPA phases down to the base amount between the 4th/5th
    // bracket thresholds. Credit is applied at the lowest bracket rate.
    bpaMax: 16452, bpaMin: 14835, bpaPhaseStart: 181440, bpaPhaseEnd: 258482,
  },
  ON: {
    brackets: [[53944, 0.0505], [107890, 0.0915], [150000, 0.1116], [220000, 0.1216], [Infinity, 0.1316]],
    bpa: 13002,
    // Ontario surtax: 20% of provincial tax over T1, plus a further 36% over T2.
    surtax: [[5824, 0.20], [7453, 0.36]],
    // Ontario Health Premium (ranges by taxable income; capped at $900).
    healthPremium: (ti) => {
      if (ti <= 20000) return 0;
      if (ti <= 36000) return Math.min(300, (ti - 20000) * 0.06);
      if (ti <= 48000) return Math.min(450, 300 + (ti - 36000) * 0.06);
      if (ti <= 72000) return Math.min(600, 450 + (ti - 48000) * 0.25);
      if (ti <= 200000) return Math.min(750, 600 + (ti - 72000) * 0.25);
      return Math.min(900, 750 + (ti - 200000) * 0.25);
    },
  },
  BC: {
    brackets: [[50265, 0.0506], [100531, 0.077], [115421, 0.105], [140155, 0.1229], [190032, 0.147], [265026, 0.168], [Infinity, 0.205]],
    bpa: 13191,
    surtax: [], healthPremium: () => 0,
  },
  // CPP (employee share). Base 4.95% + first enhancement 1% on pensionable earnings between the
  // basic exemption and the YMPE; second enhancement (CPP2) 4% between YMPE and YAMPE.
  cpp: { exemption: 3500, ympe: 74600, yampe: 85000, baseRate: 0.0495, enhRate: 0.01, cpp2Rate: 0.04 },
  // EI (employee share, outside Quebec).
  ei: { mie: 68900, rate: 0.0163 },
};

function bracketTax(income, brackets) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of brackets) {
    if (income <= lower) break;
    tax += (Math.min(income, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export function estimateNetIncome(grossAnnual, province = 'ON') {
  const gross = Math.max(0, Number(String(grossAnnual ?? '').replace(/[^\d.]/g, '')) || 0);
  const prov = RATES[province] ? province : 'ON';
  if (!gross) return { gross: 0, net: 0, federalTax: 0, provincialTax: 0, cpp: 0, ei: 0, province: prov, year: TAX_YEAR };

  // CPP / EI
  const c = RATES.cpp;
  const pensionable = Math.max(0, Math.min(gross, c.ympe) - c.exemption);
  const cppBase = pensionable * c.baseRate;
  const cppEnh = pensionable * c.enhRate;
  const cpp2 = Math.max(0, Math.min(gross, c.yampe) - c.ympe) * c.cpp2Rate;
  const cpp = cppBase + cppEnh + cpp2;
  const ei = Math.min(gross, RATES.ei.mie) * RATES.ei.rate;

  // Enhanced CPP contributions are a deduction from income; base CPP + EI are credits.
  const taxable = Math.max(0, gross - cppEnh - cpp2);

  // Federal
  const f = RATES.federal;
  const fLow = f.brackets[0][1];
  let bpa = f.bpaMax;
  if (taxable > f.bpaPhaseStart) {
    const t = Math.min(1, (taxable - f.bpaPhaseStart) / (f.bpaPhaseEnd - f.bpaPhaseStart));
    bpa = f.bpaMax - (f.bpaMax - f.bpaMin) * t;
  }
  const fedCredits = (bpa + cppBase + ei) * fLow;
  const federalTax = Math.max(0, bracketTax(taxable, f.brackets) - fedCredits);

  // Provincial
  const p = RATES[prov];
  const pLow = p.brackets[0][1];
  let provBasic = Math.max(0, bracketTax(taxable, p.brackets) - (p.bpa + cppBase + ei) * pLow);
  let surtax = 0;
  for (const [threshold, rate] of p.surtax) surtax += Math.max(0, provBasic - threshold) * rate;
  const provincialTax = provBasic + surtax + p.healthPremium(taxable);

  const net = Math.max(0, gross - federalTax - provincialTax - cpp - ei);
  const r = (n) => Math.round(n);
  return { gross: r(gross), net: r(net), federalTax: r(federalTax), provincialTax: r(provincialTax), cpp: r(cpp), ei: r(ei), province: prov, year: TAX_YEAR };
}
