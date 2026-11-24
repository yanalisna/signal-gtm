import { route } from "@/lib/api";
import { creditStatus, setupFlexprice, topUp } from "@/lib/flexprice";
import { audit, logActivity } from "@/lib/store";

export const POST = route("billing", async (body) => {
  if (body.action === "setup") {
    await setupFlexprice();
    logActivity({ step: "billing", message: "Flexprice customer + prepaid wallet ready" });
  } else {
    const n = Number(body.credits) || 10;
    await topUp(n);
    audit({ actor: "Rep", action: "credits.topup", target: "wallet", detail: String(n) });
    logActivity({ step: "billing", message: `Topped up ${n} credits` });
  }
  return { credits: await creditStatus() };
});
