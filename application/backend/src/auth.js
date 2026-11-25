import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { run } from "./db.js";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const credPath = path.resolve(appDir, process.env.FIREBASE_SA_FILE || "secrets/sprpa-87334-firebase-adminsdk-fbsvc-71f06c7a4a.json");
if (!fs.existsSync(credPath)) {
  console.error(`Firebase service account not found at ${credPath}`);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(credPath, "utf8"));
export const adminProjectId = sa.project_id;
admin.initializeApp({ credential: admin.credential.cert(sa) });

// Verifies the Firebase ID token (email/password or Google) and upserts the user row.
export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
  let d;
  try { d = await admin.auth().verifyIdToken(token, true); }
  catch { return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired token" } }); }
  req.uid = d.uid;
  req.user = { uid: d.uid, email: d.email, name: d.name || d.email?.split("@")[0], photo: d.picture || null, provider: d.firebase?.sign_in_provider };
  try {
    run(`INSERT INTO users(uid,email,name,photo) VALUES(?,?,?,?)
         ON CONFLICT(uid) DO UPDATE SET email=excluded.email, name=excluded.name, photo=excluded.photo`,
      req.user.uid, req.user.email ?? null, req.user.name ?? null, req.user.photo);
  } catch (e) { console.error(e); return res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } }); }
  next();
}

export const audit = (req, action, resource) => {
  try { run("INSERT INTO audit_log(uid,action,resource,ip) VALUES(?,?,?,?)", req.uid, action, resource, req.ip); } catch {}
};
