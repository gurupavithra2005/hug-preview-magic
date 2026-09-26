/**
 * CAPTCHA provider abstraction.
 * - TurnstileProvider: real verification when TURNSTILE_SECRET_KEY is configured.
 * - DemoProvider: clearly-labelled demo challenge. It is NOT real bot protection;
 *   server-side rate limiting and risk scoring stay active regardless.
 */
export interface CaptchaProvider {
  readonly mode: "turnstile" | "demo";
  verify(token: string | undefined, ipHash: string | null): Promise<boolean>;
}

export const DEMO_CAPTCHA_TOKEN = "demo-human-check-v1";

class DemoProvider implements CaptchaProvider {
  readonly mode = "demo" as const;
  async verify(token: string | undefined) {
    return token === DEMO_CAPTCHA_TOKEN;
  }
}

class TurnstileProvider implements CaptchaProvider {
  readonly mode = "turnstile" as const;
  constructor(private readonly secret: string) {}
  async verify(token: string | undefined) {
    if (!token) return false;
    try {
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: this.secret, response: token }),
      });
      const body = (await res.json()) as { success?: boolean };
      return body.success === true;
    } catch {
      return false;
    }
  }
}

export function getCaptchaProvider(): CaptchaProvider {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  return secret ? new TurnstileProvider(secret) : new DemoProvider();
}
