const ROLE_PERMS = {
  cashier: ["sales.create", "payments.collect"],
  admin: ["sales.create", "users.manage", "settings.manage"],
  tailor: ["orders.manage"],
};
function can(role, perm) {
  return (ROLE_PERMS[role] || []).includes(perm);
}
let f = 0;
function a(c, m) {
  if (!c) {
    console.error("FAIL", m);
    f++;
  } else console.log("OK", m);
}
a(can("cashier", "sales.create"), "cashier can sell");
a(!can("cashier", "users.manage"), "cashier cannot manage users");
a(!can("tailor", "sales.create"), "tailor cannot sell");
a(can("admin", "settings.manage"), "admin settings");
if (f) process.exit(1);
console.log("permission tests passed");
