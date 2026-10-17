import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("apps/web/src/app/page.tsx", "utf8");
const popup = readFileSync("apps/web/src/app/TrialWelcomePopup.tsx", "utf8");
const layout = readFileSync("apps/web/src/app/layout.tsx", "utf8");

assert.match(popup, /^"use client";/, "Delayed popup must render only on the client");
assert.match(home, /import TrialWelcomePopup from "\.\/TrialWelcomePopup"/);
assert.match(home, /<TrialWelcomePopup\s*\/>/, "Popup must be mounted on public homepage");
assert.doesNotMatch(layout, /TrialWelcomePopup/, "Never interrupt authenticated app routes");

assert.match(popup, /MOBILE_SCROLL_FRACTION\s*=\s*0\.5\s*;/, "Mobile prompt starts only after 50% scroll");
assert.match(popup, /window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/, "Desktop exit intent needs genuine pointer");
assert.match(popup, /document\.addEventListener\("mouseout", onExitIntent\)/, "Detect desktop mouse exit");
assert.match(popup, /event\.relatedTarget !== null/, "Never trigger when cursor just changes element");
assert.match(popup, /event\.clientY > 8/, "Do not interrupt side or bottom exits");
assert.match(popup, /window\.addEventListener\("scroll", onMobileScroll, \{ passive: true \}\)/, "Scroll trigger is passive");
assert.match(popup, /window\.scrollY \/ available >= MOBILE_SCROLL_FRACTION/, "Mobile engages after half the page");
assert.match(popup, /document\.removeEventListener\("mouseout", onExitIntent\)/, "Remove desktop listener after trigger and unmount");
assert.match(popup, /window\.removeEventListener\("scroll", onMobileScroll\)/, "Remove mobile listener after trigger and unmount");
assert.doesNotMatch(popup, /setTimeout|SHOW_AFTER_MS|10_000/, "No time-based automatic popup");
assert.match(popup, /window\.sessionStorage\.getItem\(TRIAL_POPUP_SHOWN_NAME\)/, "Check session visibility");
assert.match(popup, /window\.sessionStorage\.setItem\(TRIAL_POPUP_SHOWN_NAME, "shown"\)/, "Avoid repeating popup on navigation during same tab session");
assert.doesNotMatch(popup, /localStorage|document\.cookie/, "No persistent tracking required");

assert.match(popup, /role="dialog"/);
assert.match(popup, /aria-modal="true"/);
assert.match(popup, /aria-labelledby="trial-popup-title"/);
assert.match(popup, /aria-describedby="trial-popup-description"/);
assert.match(popup, /event\.key === "Escape"/, "Escape dismisses");
assert.match(popup, /event\.key !== "Tab"/, "Tab focus stays within modal");
assert.match(popup, /closeRef\.current\?\.focus\(\)/, "Focus moves to visible close control");
assert.match(popup, /previousFocus\?\.focus\(\)/, "Restore focus when popup closes");
assert.match(popup, /aria-label="Close free trial offer"/);
assert.match(popup, /onClick=\{\(\) => setOpen\(false\)\}/, "Provide a visible dismiss button");
assert.match(popup, /max-w-\[1000px\]/);
assert.match(popup, /md:grid-cols/, "Responsive desktop split layout");
assert.match(popup, /maxHeight: "calc\(100dvh - 24px\)"/, "Fit small screens");
assert.match(popup, /\/minarva-biz-mark\.svg/);
assert.match(popup, /\/marketing-dashboard\.jpg/, "Use Minarva-owned illustrative interface, not Vyapar imagery");
assert.match(popup, /30<\/span>[\s\S]*Days Free Trial/, "Trial duration is 30 days");
assert.match(popup, /v1\.0\.15/, "Link only official published installer");
assert.match(popup, /self-service trial signup is still being prepared/i, "Do not imply live automatic activation");
assert.doesNotMatch(popup, /applyTrial\(|signUp\(|createUser\(|grantLicense\(/, "Popup may never alter commercial entitlement");
assert.doesNotMatch(popup, /91%|crore|185K|5X more profits|4\.8/, "Never copy unverifiable competitor statistics");
assert.match(home, /The evaluation period is 30 days/, "Website disclosure must agree with popup");
assert.match(home, /Self-service signup and automatic trial activation are still in progress/, "Website FAQ must not promise unready signup");

console.log("Public 30-day exit-intent and mobile-scroll trial modal contract PASS");
