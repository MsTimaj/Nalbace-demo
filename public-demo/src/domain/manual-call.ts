import type {ClientCase} from "./cases.ts";
export function manualCallTarget(c:ClientCase){const phone=c.contactPermission?.phone??"";return c.hold!=="suppressed"&&c.verifiedContact&&/^\+[1-9]\d{6,14}$/.test(phone)?`tel:${phone}`:null;}
