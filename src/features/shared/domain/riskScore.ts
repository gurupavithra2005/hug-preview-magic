/**
 * Layered anti-bot scoring. Runs server-side on every reservation request.
 * Signals are cheap, explainable and combined into ALLOW / CHALLENGE / BLOCK.
 */
export interface RiskSignals {
  honeypotFilled: boolean;
  /** ms between form render and submit, as reported by client (null if absent). */
  formFillMs: number | null;
  userAgent: string | null;
  captchaPassed: boolean;
  highDemand: boolean;
}

export type RiskDecision = "ALLOW" | "CHALLENGE" | "BLOCK";

export interface RiskAssessment {
  score: number;
  decision: RiskDecision;
  reasons: string[];
}

export const RISK_THRESHOLDS = { challenge: 40, block: 80 } as const;

const BOT_UA = /(curl|wget|python-requests|httpclient|headless|phantom|selenium|puppeteer|scrapy|go-http)/i;

export function assessRisk(s: RiskSignals): RiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (s.honeypotFilled) {
    return { score: 100, decision: "BLOCK", reasons: ["Hidden honeypot field was filled"] };
  }
  if (s.formFillMs === null) {
    score += 20;
    reasons.push("Missing form timing signal");
  } else if (s.formFillMs < 700) {
    score += 50;
    reasons.push(`Form submitted in ${Math.round(s.formFillMs)}ms (inhumanly fast)`);
  } else if (s.formFillMs < 2000) {
    score += 15;
    reasons.push("Very fast form submission");
  }
  if (!s.userAgent) {
    score += 25;
    reasons.push("No user-agent header");
  } else if (BOT_UA.test(s.userAgent)) {
    score += 45;
    reasons.push("Automation user-agent");
  }
  if (s.highDemand) {
    score += 10;
    reasons.push("High-demand event: stricter policy");
  }
  if (s.captchaPassed) {
    score = Math.max(0, score - 60);
    reasons.push("Verification challenge passed");
  }

  score = Math.min(100, score);
  let decision: RiskDecision = "ALLOW";
  if (score >= RISK_THRESHOLDS.block) decision = "BLOCK";
  else if (score >= RISK_THRESHOLDS.challenge) decision = "CHALLENGE";
  return { score, decision, reasons };
}
